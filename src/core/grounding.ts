import type { DraftOutput, Finding, SkuDef } from "./types";

/**
 * Deterministic grounding check — no model call, no self-reported confidence.
 *
 * Borrowed from the "source custody" pattern in irys-stateful-swarms: entries
 * claiming a source that cannot be matched to a real document get quarantined
 * rather than trusted. The research is unambiguous that self-assessed model
 * confidence is uncalibrated at every tier (ECE 0.05–0.20), while mechanical
 * verification cuts grounding failures by an order of magnitude — so the gate
 * in front of a human reviewer must be arithmetic, not vibes.
 *
 * We check overlap between a finding's rationale and the actual source text:
 * distinctive terms in the rationale must appear in the documents.
 */

const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "was", "were", "are",
  "has", "have", "had", "not", "but", "its", "their", "there", "which", "when",
  "than", "then", "into", "over", "under", "does", "did", "per", "any", "all",
  "estimate", "carrier", "line", "item", "items", "shows", "show", "appears",
  "records", "record", "documented", "document", "documents", "provided",
]);

function terms(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 3 && !STOP.has(w)),
    ),
  );
}

export interface GroundingResult {
  findingId: string;
  overlap: number; // 0..1 share of distinctive rationale terms present in sources
  quarantined: boolean;
}

export interface GroundingReport {
  results: GroundingResult[];
  quarantinedIds: string[];
  /** Findings kept for human review. */
  kept: Finding[];
}

/** Terms in the rationale that also appear in the source documents. */
export function groundingOverlap(rationale: string, source: string): number {
  const t = terms(rationale);
  if (t.length === 0) return 1;
  const hay = source.toLowerCase();
  const hits = t.filter((w) => hay.includes(w)).length;
  return hits / t.length;
}

/**
 * Threshold chosen to be conservative: quarantine only when a clear majority of
 * distinctive terms are absent from the sources. Quarantined findings are not
 * deleted — they are withheld from the reviewer and recorded, so the rate is
 * measurable (see `pnpm doctor`).
 */
export const GROUNDING_THRESHOLD = 0.4;

export function checkGrounding(
  def: SkuDef,
  input: unknown,
  output: DraftOutput,
): GroundingReport {
  const source = def.sourceText(input);
  const results: GroundingResult[] = output.findings.map((f) => {
    const locators = f.cellLocators;
    if (locators && locators.length >= 2 && locators.every((l) => l.resolved !== false)) {
      return { findingId: f.id, overlap: 1, quarantined: false };
    }
    const overlap = groundingOverlap(`${f.title} ${f.rationale}`, source);
    return { findingId: f.id, overlap, quarantined: overlap < GROUNDING_THRESHOLD };
  });
  const quarantinedIds = results.filter((r) => r.quarantined).map((r) => r.findingId);
  return {
    results,
    quarantinedIds,
    kept: output.findings.filter((f) => !quarantinedIds.includes(f.id)),
  };
}
