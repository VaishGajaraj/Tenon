import type { Flag } from "./predicates";
import type { PredicateName } from "./schema";
import { PREDICATES } from "./schema";

export interface CommitteeCounts {
  flagsTotal: number;
  byPredicate: Record<PredicateName, number>;
  frequencyAttributeMismatches: number;
  quarantined: number;
  iaRowCount: number;
  soxRowCount: number;
  autoMatches: number;
  fuzzyFlagged: number;
  autoMatchedFuzzy: number;
}

export function committeeCounts(opts: {
  flags: Flag[];
  quarantined: number;
  iaRowCount: number;
  soxRowCount: number;
  autoMatches: number;
  fuzzyFlagged: number;
  autoMatchedFuzzy: number;
}): CommitteeCounts {
  const byPredicate = Object.fromEntries(PREDICATES.map((p) => [p, 0])) as Record<PredicateName, number>;
  for (const f of opts.flags) byPredicate[f.predicate]++;
  return {
    flagsTotal: opts.flags.length,
    byPredicate,
    frequencyAttributeMismatches: opts.flags.filter(
      (f) => f.predicate === "attribute_mismatch" && f.field === "frequency",
    ).length,
    quarantined: opts.quarantined,
    iaRowCount: opts.iaRowCount,
    soxRowCount: opts.soxRowCount,
    autoMatches: opts.autoMatches,
    fuzzyFlagged: opts.fuzzyFlagged,
    autoMatchedFuzzy: opts.autoMatchedFuzzy,
  };
}

/**
 * One-page committee delta from code-computed counts. Not model prose.
 */
export function committeeDeltaText(
  bankName: string,
  asOf: string,
  copies: { ia: string; sox: string },
  counts: CommitteeCounts,
  dispositions?: Record<string, number>,
  rejected?: number,
): string {
  const lines = [
    `${bankName} — MOCK RCM reconciliation`,
    `Copies: ${copies.ia} (${counts.iaRowCount} rows) vs ${copies.sox} (${counts.soxRowCount} rows)`,
    `Import as-of: ${asOf} (file evidence; not the wall clock)`,
    ``,
    `Flags (code-computed): ${counts.flagsTotal}`,
    `  description divergence: ${counts.byPredicate.description_divergence}`,
    `  attribute mismatch: ${counts.byPredicate.attribute_mismatch} (frequency quoted as attribute: ${counts.frequencyAttributeMismatches})`,
    `  unmatched in a copy (VLOOKUP-class): ${counts.byPredicate.unmatched_in_copy}`,
    `  needs human match (fuzzy, never auto): ${counts.byPredicate.needs_human_match}`,
    `  renumbered: ${counts.byPredicate.renumbered}`,
    `  withdrawn still tested: ${counts.byPredicate.withdrawn_still_tested}`,
    `  changed since last import: ${counts.byPredicate.changed_since_last_import}`,
    `  owner not in directory: ${counts.byPredicate.owner_not_in_directory}`,
    `  unmapped control: ${counts.byPredicate.unmapped_control}`,
    `  dead risk mapping: ${counts.byPredicate.dead_risk_mapping}`,
    `  risk without control: ${counts.byPredicate.risk_without_control}`,
    `  orphaned issue: ${counts.byPredicate.orphaned_issue}`,
    `  duplicate candidate: ${counts.byPredicate.duplicate_candidate}`,
    `  stale review: ${counts.byPredicate.stale_review}`,
    `Quarantined (unresolved evidence, not shown): ${counts.quarantined}`,
    `Identity ladder: auto ${counts.autoMatches} · fuzzy flagged ${counts.fuzzyFlagged} · auto-matched fuzzy ${counts.autoMatchedFuzzy} (must be 0)`,
  ];
  if (dispositions) {
    lines.push(`Dispositions: ${Object.entries(dispositions).map(([k, v]) => `${k}=${v}`).join(", ") || "none"}`);
  }
  if (rejected != null) lines.push(`Rejected flags retained on workpaper: ${rejected}`);
  lines.push(``, `This page is arithmetic over the fact table. It is not model narrative.`);
  return lines.join("\n");
}
