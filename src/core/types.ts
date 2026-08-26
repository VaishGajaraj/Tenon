import { z } from "zod";

/** A single flagged item in a deliverable draft. */
export const Finding = z.object({
  id: z.string(), // stable within a run, e.g. "f1"
  category: z.string(), // SKU-defined vocabulary
  title: z.string(),
  rationale: z.string(), // must cite the source documents
  citation: z.string(), // e.g. "IICRC S500 12.2.12" or "IRC R905.2.8.5"
  estimatedValueUsd: z.tuple([z.number(), z.number()]).nullable(), // [low, high]
  confidence: z.enum(["high", "medium", "low"]),
});
export type Finding = z.infer<typeof Finding>;

/** Canonical draft output shape shared by document-review SKUs. */
export const DraftOutput = z.object({
  findings: z.array(Finding),
  narrative: z.string(),
  selfCheckNotes: z.array(z.string()).default([]),
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

export interface CorrectionEvent {
  targetPath: string;
  kind: CorrectionKind;
  reasonCode: string;
  before: unknown;
  after: unknown;
  note?: string;
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
  reasonCodes: { code: string; label: string }[];
  /** Finding categories for this SKU. */
  categories: string[];
  /** Version 1 system prompt (seeded into prompt_versions on init). */
  systemPromptV1: string;
  /** Renders the user message for a given validated input. */
  renderUserMessage(input: any): string;
  /** Grading rubric shown to the eval grader model. */
  evalRubric: string;
  /** Mock draft used when no API key is configured (offline demo). */
  mockDraft(input: any): DraftOutput;
}
