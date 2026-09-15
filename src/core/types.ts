import { z } from "zod";

export const CellLocator = z.object({
  copy: z.string(),
  sheet: z.string(),
  row: z.number(),
  column: z.string(),
  quote: z.string().nullable().optional(),
  resolved: z.boolean().optional(),
  note: z.string().optional(),
});
export type CellLocator = z.infer<typeof CellLocator>;

/** A single flagged item in a deliverable draft. */
export const Finding = z.object({
  id: z.string(), // stable within a run, e.g. "f1"
  category: z.string(), // SKU-defined vocabulary
  title: z.string(),
  rationale: z.string(), // must cite the source documents
  citation: z.string(), // e.g. "IICRC S500 12.2.12" or "IRC R905.2.8.5"
  estimatedValueUsd: z.tuple([z.number(), z.number()]).nullable(), // [low, high]
  confidence: z.enum(["high", "medium", "low"]),
  /** RCM: which TypeScript predicate emitted this flag. */
  predicate: z.string().optional(),
  cellLocators: z.array(CellLocator).optional(),
  quotes: z
    .object({ left: z.string().optional(), right: z.string().optional() })
    .optional(),
  iaDisplayId: z.string().nullable().optional(),
  soxDisplayId: z.string().nullable().optional(),
  field: z.string().nullable().optional(),
  disposition: z.string().optional(),
  dispositionRationale: z.string().optional(),
});
export type Finding = z.infer<typeof Finding>;

/** Canonical draft output shape shared by document-review SKUs. */
export const DraftOutput = z.object({
  findings: z.array(Finding),
  narrative: z.string(),
  selfCheckNotes: z.array(z.string()).default([]),
  rejectedFlags: z.array(Finding).optional(),
  copies: z
    .array(z.object({ name: z.string(), rowCount: z.number(), sheet: z.string().optional() }))
    .optional(),
  committeeCounts: z.unknown().optional(),
  workpaper: z
    .object({
      preparer: z.string(),
      reviewer: z.string(),
      date: z.string(),
      mode: z.enum(["MOCK", "REAL"]),
    })
    .optional(),
  mode: z.enum(["MOCK", "REAL"]).optional(),
  mechanisms: z.unknown().optional(),
});
export type DraftOutput = z.infer<typeof DraftOutput>;

export type WorkItemStatus =
  | "intake"
  | "drafting"
  | "in_review"
  | "approved"
  | "delivered"
  | "failed";

export const CorrectionKind = z.enum(["edit", "reject", "add"]);
export type CorrectionKind = z.infer<typeof CorrectionKind>;

export const CorrectionEvent = z.object({
  targetPath: z.string(),
  kind: CorrectionKind,
  reasonCode: z.string(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  note: z.string().optional(),
});
export type CorrectionEvent = z.infer<typeof CorrectionEvent>;

/**
 * A reviewer reason code. `weight` and `mockLesson` live here (not in the
 * learning loop) so that core never knows a tenant's vocabulary — ADR-3.
 */
export interface ReasonCode {
  code: string;
  label: string;
  /** Eval weight for cases mined from this reason. Style fixes matter less. */
  weight: number;
  /** What the offline reflection heuristic should learn from this cluster. */
  mockLesson: string;
  /**
   * How to turn a correction with this reason into a discriminative eval case.
   *  - "forbid_title": the drafted title must not reappear (rejections)
   *  - "require_terms": the corrected content's key terms must appear (adds)
   *  - "forbid_citation": that finding must not carry the old citation
   *  - "none": not mined (pure style)
   */
  expectation: "forbid_title" | "require_terms" | "forbid_citation" | "none";
}

/** A prompt version as the runner/learning loop sees it. */
export interface PromptSnapshot {
  systemPrompt: string;
  fewShots: { situation: string; lesson: string }[];
}

/** SKU definition: everything tenant-specific lives here. */
export interface SkuDef {
  tenant: string;
  sku: string;
  displayName: string;
  description: string;
  /** zod schema for the intake payload */
  inputSchema: z.ZodTypeAny;
  /** Fields shown on the intake form, in order. */
  intakeFields: { key: string; label: string; kind: "text" | "textarea" }[];
  /** Reviewer reason-code vocabulary (drives the learning loop). */
  reasonCodes: ReasonCode[];
  /** Finding categories for this SKU. */
  categories: string[];
  /** When set, accept requires a disposition from this closed list. */
  dispositions?: string[];
  /** When true, rejected findings must remain on final.rejectedFlags. */
  persistRejectedFlags?: boolean;
  /**
   * If set, drafting uses this instead of the LLM. Predicates and identity
   * live here; the model is not the source of flags.
   */
  deterministicDraft?: (input: any, pv: PromptSnapshot) => DraftOutput;
  /** Version 1 system prompt (seeded into prompt_versions on init). */
  systemPromptV1: string;
  /** Renders the user message for a given validated input. */
  renderUserMessage(input: any): string;
  /** Grading rubric handed to the grader model in real mode. */
  evalRubric: string;
  /**
   * The source text a finding must be grounded in. Used by the deterministic
   * grounding check — no model call, no self-reported confidence.
   */
  sourceText(input: any): string;
  /**
   * Mock draft for offline mode. MUST be a function of the prompt snapshot as
   * well as the input, otherwise the offline eval gate is a tautology: every
   * version produces identical output and can never be shown to improve.
   */
  mockDraft(input: any, pv: PromptSnapshot): DraftOutput;
}
