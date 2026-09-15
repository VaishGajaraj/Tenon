import { z } from "zod";

/** Public-domain demo tenant. Never treated as a client file. */
export const DEMO_BANK = {
  name: "Wrenbridge Community Bank, N.A.",
  fictional: true,
  bankfindCheck: {
    queried: 'FDIC BankFind API institutions?filters=NAME:"Wrenbridge"',
    asOf: "2026-09-15",
    hits: 0,
  },
} as const;

export const COPY_IA = "IA RCM";
export const COPY_SOX = "SOX RCM";

export const DISPOSITIONS = [
  "retain",
  "merge",
  "automate",
  "re-designate",
  "retire",
  "re-own",
  "update",
] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

export const REJECT_REASON_CODES = [
  "false_positive_match",
  "missed_match",
  "semantics_differ_by_source",
  "copy_is_authoritative",
  "intentional_variant",
  "duplicate_intentional",
  "trigger_not_applicable",
  "wrong_severity",
  "evidence_insufficient",
  "missed_by_predicate",
] as const;
export type RejectReasonCode = (typeof REJECT_REASON_CODES)[number];

export const PREDICATES = [
  "withdrawn_still_tested",
  "renumbered",
  "description_divergence",
  "attribute_mismatch",
  "changed_since_last_import",
  "owner_not_in_directory",
  "unmapped_control",
  "dead_risk_mapping",
  "risk_without_control",
  "orphaned_issue",
  "duplicate_candidate",
  "stale_review",
  "unmatched_in_copy",
  "needs_human_match",
] as const;
export type PredicateName = (typeof PREDICATES)[number];

/** Identity-ladder rungs. Fuzzy is flagged for a human and never auto-matched. */
export const MATCH_METHODS = ["record_id", "display_id", "content_hash", "fuzzy"] as const;
export type MatchMethod = (typeof MATCH_METHODS)[number];

export const CellLocator = z.object({
  copy: z.string(),
  sheet: z.string(),
  row: z.number().int(),
  column: z.string(),
  quote: z.string().nullable(),
  resolved: z.boolean(),
  note: z.string().optional(),
});
export type CellLocator = z.infer<typeof CellLocator>;

export const FactRow = z.object({
  copy: z.string(),
  sheet: z.string(),
  excelRow: z.number().int(),
  recordId: z.string(),
  displayId: z.string(),
  crosswalkId: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  owner: z.string(),
  frequency: z.string(),
  riskIds: z.array(z.string()),
  status: z.enum(["active", "withdrawn", "retired"]),
  tested: z.boolean(),
  lastReviewedOn: z.string(),
  sourceModifiedOn: z.string(),
  issueId: z.string().nullable(),
  issueStatus: z.string().nullable(),
  rowHash: z.string(),
  columns: z.record(z.string()),
});
export type FactRow = z.infer<typeof FactRow>;

export const DirectoryPerson = z.object({
  name: z.string(),
  title: z.string(),
  email: z.string(),
});
export type DirectoryPerson = z.infer<typeof DirectoryPerson>;

export const RiskRecord = z.object({
  riskId: z.string(),
  title: z.string(),
  owner: z.string(),
});
export type RiskRecord = z.infer<typeof RiskRecord>;

export const IssueRecord = z.object({
  issueId: z.string(),
  title: z.string(),
  controlDisplayId: z.string(),
  status: z.string(),
});
export type IssueRecord = z.infer<typeof IssueRecord>;

export const TriggerEvent = z.object({
  name: z.string(),
  date: z.string(),
});
export type TriggerEvent = z.infer<typeof TriggerEvent>;

export const GroundTruthEntry = z.object({
  id: z.string(),
  predicate: z.enum(PREDICATES),
  iaDisplayId: z.string().nullable(),
  soxDisplayId: z.string().nullable(),
  field: z.string().nullable(),
  iaValue: z.string().nullable(),
  soxValue: z.string().nullable(),
  note: z.string(),
});
export type GroundTruthEntry = z.infer<typeof GroundTruthEntry>;

export const RawWorkbook = z.object({
  copyName: z.string(),
  sheet: z.string(),
  headers: z.array(z.string()),
  rows: z.array(z.record(z.string())),
});
export type RawWorkbook = z.infer<typeof RawWorkbook>;

export const ReconUniverse = z.object({
  bankName: z.string(),
  asOf: z.string(),
  dataMode: z.literal("MOCK"),
  ia: RawWorkbook,
  sox: RawWorkbook,
  priorSox: RawWorkbook,
  directory: z.array(DirectoryPerson),
  risks: z.array(RiskRecord),
  issues: z.array(IssueRecord),
  triggers: z.array(TriggerEvent),
  groundTruth: z.array(GroundTruthEntry),
});
export type ReconUniverse = z.infer<typeof ReconUniverse>;

export const AutoMatch = z.object({
  method: z.enum(["record_id", "display_id", "content_hash"]),
  ia: FactRow,
  sox: FactRow,
});
export type AutoMatch = z.infer<typeof AutoMatch>;

export const FuzzyProposal = z.object({
  method: z.literal("fuzzy"),
  ia: FactRow,
  sox: FactRow,
  score: z.number(),
});
export type FuzzyProposal = z.infer<typeof FuzzyProposal>;
