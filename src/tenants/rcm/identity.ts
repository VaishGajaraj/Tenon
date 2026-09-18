import { createHash } from "node:crypto";
import type { AutoMatch, FactRow, FuzzyProposal } from "./schema";

/**
 * Identity ladder (never skip a rung):
 *   1. same-system record id (crosswalk / GRC key)
 *   2. normalized display id
 *   3. content hash of title+description
 *   4. fuzzy similarity — FLAGGED for a human, NEVER auto-matched
 */

export const FUZZY_FLAG_THRESHOLD = 0.62;
export const DUPLICATE_THRESHOLD = 0.85;

export function normalizeDisplayId(id: string): string {
  return id
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.replace(/^0+(\d)/, "$1"))
    .join("-");
}

export function contentHash(title: string, description: string): string {
  const n = `${title}\n${description}`.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(n).digest("hex");
}

export function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3),
  );
}

/** Dice coefficient on token sets. */
export function similarity(a: string, b: string): number {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return (2 * inter) / (A.size + B.size);
}

export interface LadderResult {
  auto: AutoMatch[];
  fuzzy: FuzzyProposal[];
  unmatchedIa: FactRow[];
  unmatchedSox: FactRow[];
  rungCounts: { record_id: number; display_id: number; content_hash: number; fuzzy_flagged: number };
  /** Must stay 0 — fuzzy is never an auto match. */
  autoMatchedFuzzy: number;
}

function take<T>(arr: T[], i: number): T {
  return arr.splice(i, 1)[0];
}

export function identityLadder(
  ia: FactRow[],
  sox: FactRow[],
  opts?: { pairScore?: (ia: FactRow, sox: FactRow) => number },
): LadderResult {
  const iaLeft = [...ia];
  const soxLeft = [...sox];
  const auto: AutoMatch[] = [];
  const rungCounts = { record_id: 0, display_id: 0, content_hash: 0, fuzzy_flagged: 0 };

  const pair = (
    method: AutoMatch["method"],
    pred: (a: FactRow, b: FactRow) => boolean,
  ) => {
    for (let i = 0; i < iaLeft.length; ) {
      const a = iaLeft[i];
      const j = soxLeft.findIndex((b) => pred(a, b));
      if (j >= 0) {
        auto.push({ method, ia: take(iaLeft, i), sox: take(soxLeft, j) });
        rungCounts[method]++;
      } else {
        i++;
      }
    }
  };

  pair(
    "record_id",
    (a, b) => !!a.crosswalkId && !!b.crosswalkId && a.crosswalkId === b.crosswalkId,
  );
  pair(
    "display_id",
    (a, b) =>
      !!a.displayId &&
      !!b.displayId &&
      normalizeDisplayId(a.displayId) === normalizeDisplayId(b.displayId),
  );
  pair(
    "content_hash",
    (a, b) => contentHash(a.title, a.description) === contentHash(b.title, b.description),
  );

  const fuzzy: FuzzyProposal[] = [];
  const iaUsed = new Set<string>();
  const soxUsed = new Set<string>();
  const candidates: FuzzyProposal[] = [];
  const pairScore =
    opts?.pairScore ??
    ((a: FactRow, b: FactRow) => similarity(`${a.title} ${a.description}`, `${b.title} ${b.description}`));
  for (const a of iaLeft) {
    for (const b of soxLeft) {
      const score = pairScore(a, b);
      if (score >= FUZZY_FLAG_THRESHOLD) {
        candidates.push({ method: "fuzzy", ia: a, sox: b, score });
      }
    }
  }
  candidates.sort((x, y) => y.score - x.score);
  for (const c of candidates) {
    const iaKey = c.ia.recordId + c.ia.displayId;
    const soxKey = c.sox.recordId + c.sox.displayId;
    if (iaUsed.has(iaKey) || soxUsed.has(soxKey)) continue;
    iaUsed.add(iaKey);
    soxUsed.add(soxKey);
    fuzzy.push(c);
    rungCounts.fuzzy_flagged++;
  }

  const unmatchedIa = iaLeft.filter((r) => !iaUsed.has(r.recordId + r.displayId));
  const unmatchedSox = soxLeft.filter((r) => !soxUsed.has(r.recordId + r.displayId));

  return {
    auto,
    fuzzy,
    unmatchedIa,
    unmatchedSox,
    rungCounts,
    autoMatchedFuzzy: 0,
  };
}
