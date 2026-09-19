import type { DraftOutput, PromptSnapshot } from "@/core/types";
import type { ReconUniverse, GroundTruthEntry, PredicateName } from "./schema";
import { COPY_IA, COPY_SOX, PREDICATES } from "./schema";
import { generateDemoUniverse } from "./generate";
import { ingestWorkbookDetailed, IA_MAP, SOX_MAP, detectColumnMap, type ColumnMap } from "./ingest";
import { CANONICAL_CONTROLS } from "./library";
import { identityLadder } from "./identity";
import { runPredicates, type Flag } from "./predicates";
import { committeeCounts, committeeDeltaText } from "./committee";

export interface GroundTruthScore {
  predicate: PredicateName;
  expected: number;
  predicted: number;
  truePositives: number;
  precision: number | null;
  recall: number | null;
}

function flagKey(f: { predicate: string; iaDisplayId?: string | null; soxDisplayId?: string | null; field?: string | null }) {
  return `${f.predicate}|${f.field ?? ""}|${f.iaDisplayId ?? ""}|${f.soxDisplayId ?? ""}`;
}

function gtKey(g: GroundTruthEntry) {
  return `${g.predicate}|${g.field ?? ""}|${g.iaDisplayId ?? ""}|${g.soxDisplayId ?? ""}`;
}

function keysLooselyEqual(a: string, b: string): boolean {
  if (a === b) return true;
  const [ap, af, ai, as] = a.split("|");
  const [bp, bf, bi, bs] = b.split("|");
  if (ap !== bp) return false;
  if (af && bf && af !== bf) return false;
  const idsA = [ai, as].filter(Boolean);
  const idsB = [bi, bs].filter(Boolean);
  if (idsA.length === 0 || idsB.length === 0) return idsA.length === 0 && idsB.length === 0;
  return idsA.some((id) => idsB.includes(id));
}

export function scoreAgainstGroundTruth(flags: Flag[], gt: GroundTruthEntry[]): GroundTruthScore[] {
  return PREDICATES.map((predicate) => {
    const expected = gt.filter((g) => g.predicate === predicate);
    const predicted = flags.filter((f) => f.predicate === predicate);
    const used = new Set<number>();
    let tp = 0;
    for (const e of expected) {
      const i = predicted.findIndex((p, idx) => !used.has(idx) && keysLooselyEqual(gtKey(e), flagKey(p)));
      if (i >= 0) {
        used.add(i);
        tp++;
      }
    }
    return {
      predicate,
      expected: expected.length,
      predicted: predicted.length,
      truePositives: tp,
      precision: predicted.length ? tp / predicted.length : expected.length === 0 ? 1 : null,
      recall: expected.length ? tp / expected.length : predicted.length === 0 ? 1 : null,
    };
  });
}

function suppressedByLessons(title: string, predicate: string, pv: PromptSnapshot): boolean {
  const words = `${title} ${predicate}`.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  return (pv.fewShots ?? []).some((s) => {
    const lesson = `${s.situation} ${s.lesson}`.toLowerCase();
    return words.some((w) => lesson.includes(w));
  });
}

export interface ReconResult {
  output: DraftOutput;
  flags: Flag[];
  quarantined: Flag[];
  universe: ReconUniverse;
}

function mapForBook(book: ReconUniverse["ia"], fallback: ColumnMap): ColumnMap {
  if (!book.headers?.length) return fallback;
  return detectColumnMap(book.headers).map;
}

export function runRecon(universe: ReconUniverse, pv: PromptSnapshot): ReconResult {
  const iaMap = mapForBook(universe.ia, IA_MAP);
  const soxMap = mapForBook(universe.sox, SOX_MAP);
  const iaIngest = ingestWorkbookDetailed(universe.ia, iaMap);
  const soxIngest = ingestWorkbookDetailed(universe.sox, soxMap);
  const priorSoxIngest = ingestWorkbookDetailed(universe.priorSox, soxMap);
  const ia = iaIngest.rows;
  const sox = soxIngest.rows;
  const priorSox = priorSoxIngest.rows;
  const ingestQuarantined = [...iaIngest.quarantined, ...soxIngest.quarantined, ...priorSoxIngest.quarantined];
  let rcsaCount = 0;
  if (universe.rcsa) {
    const rcsaIngest = ingestWorkbookDetailed(universe.rcsa, detectColumnMap(universe.rcsa.headers).map);
    rcsaCount = rcsaIngest.rows.length;
    ingestQuarantined.push(...rcsaIngest.quarantined);
  }
  const ladder = identityLadder(ia, sox);
  const { flags: allFlags, quarantined } = runPredicates({
    asOf: universe.asOf,
    directory: universe.directory,
    risks: universe.risks,
    issues: universe.issues,
    triggers: universe.triggers,
    ia,
    sox,
    priorSox,
    auto: ladder.auto,
    fuzzy: ladder.fuzzy,
    unmatchedIa: ladder.unmatchedIa,
    unmatchedSox: ladder.unmatchedSox,
  });
  const flags = allFlags.filter((f) => !suppressedByLessons(f.title, f.predicate, pv));
  const counts = committeeCounts({
    flags,
    quarantined: quarantined.length,
    iaRowCount: ia.length,
    soxRowCount: sox.length,
    autoMatches: ladder.auto.length,
    fuzzyFlagged: ladder.fuzzy.length,
    autoMatchedFuzzy: ladder.autoMatchedFuzzy,
  });
  const gt = scoreAgainstGroundTruth(flags, universe.groundTruth);
  const findings = flags.map((f) => ({
    id: f.id,
    category: f.predicate,
    title: f.title,
    rationale: f.rationale,
    citation: `${f.locators[0].copy} ${f.locators[0].sheet}!${f.locators[0].column}${f.locators[0].row} | ${f.locators[1].copy} ${f.locators[1].sheet}!${f.locators[1].column}${f.locators[1].row}`,
    estimatedValueUsd: null,
    confidence: f.confidence,
    predicate: f.predicate,
    cellLocators: f.locators,
    quotes: f.quotes,
    iaDisplayId: f.iaDisplayId,
    soxDisplayId: f.soxDisplayId,
    field: f.field,
  }));
  const output: DraftOutput = {
    findings,
    narrative: committeeDeltaText(universe.bankName, universe.asOf, { ia: COPY_IA, sox: COPY_SOX }, counts),
    selfCheckNotes: [
      "MOCK MODE: public-domain Wrenbridge Community Bank language — not a client file.",
      `Predicates over the fact table produced ${flags.length} flags; ${quarantined.length} quarantined for unresolved evidence.`,
      `Identity ladder: record_id=${ladder.rungCounts.record_id} display_id=${ladder.rungCounts.display_id} content_hash=${ladder.rungCounts.content_hash} fuzzy_flagged=${ladder.rungCounts.fuzzy_flagged} auto_fuzzy=${ladder.autoMatchedFuzzy}.`,
      "Frequency mismatches are attribute_mismatch with both values quoted. No test-vs-operating-frequency predicate exists.",
    ],
    rejectedFlags: [],
    copies: [
      { name: COPY_IA, rowCount: ia.length, sheet: universe.ia.sheet },
      { name: COPY_SOX, rowCount: sox.length, sheet: universe.sox.sheet },
      ...(universe.rcsa
        ? [{ name: universe.rcsa.copyName, rowCount: rcsaCount, sheet: universe.rcsa.sheet }]
        : []),
    ],
    committeeCounts: counts,
    workpaper: {
      preparer: "",
      reviewer: "",
      date: universe.asOf,
      mode: "MOCK",
    },
    mode: "MOCK",
    mechanisms: {
      dataMode: "MOCK",
      namedCopies: [
        COPY_IA,
        COPY_SOX,
        ...(universe.rcsa ? [universe.rcsa.copyName] : []),
      ],
      identityLadder: {
        record_id: ladder.rungCounts.record_id,
        display_id: ladder.rungCounts.display_id,
        content_hash: ladder.rungCounts.content_hash,
        fuzzy_flagged: ladder.rungCounts.fuzzy_flagged,
        autoMatchedFuzzy: ladder.autoMatchedFuzzy,
      },
      predicatesFired: [...new Set(flags.map((f) => f.predicate))],
      quarantinedUnresolvedEvidence: quarantined.length,
      frequencyAsAttributeMismatch: counts.frequencyAttributeMismatches,
      testVsOperatingFrequencyPredicate: false,
      importSetRowHashes: true,
      sourceModifiedDatesAreEvidence: true,
      wallClockNotUsedAsImportClock: true,
      groundTruthScore: gt,
      cellLocatorsPerFlag: 2,
      canonicalLibrarySize: CANONICAL_CONTROLS.length,
      fileDropIngest: universe.ingestReport?.source === "file-drop",
      ingestSource: universe.ingestReport?.source ?? "seed",
      presetMaps: universe.ingestReport?.maps ?? { ia: "ia", sox: "sox" },
      quarantinedBadRows: ingestQuarantined.length,
      optionalThirdCopy: Boolean(universe.rcsa),
    },
  };
  return { output, flags, quarantined, universe };
}

export function reconFromInput(input: unknown, pv: PromptSnapshot): DraftOutput {
  const parsed = input as Partial<ReconUniverse> & { universe?: ReconUniverse };
  const universe = parsed.universe
    ? parsed.universe
    : parsed.ia && parsed.sox
      ? (parsed as ReconUniverse)
      : generateDemoUniverse();
  return runRecon(universe, pv).output;
}
