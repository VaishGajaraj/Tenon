import { z } from "zod";
import type { SkuDef, DraftOutput } from "@/core/types";

/**
 * Tenant #1: AI-native claims-documentation firm for restoration contractors.
 * SKU: supplement-review — carrier estimate + drying/mitigation records in,
 * documented supplement findings + narrative out. Flat-fee, documentation-only:
 * the contractor signs and submits. (No adjusting, no negotiation — see SPEC §7.)
 */

const InputSchema = z.object({
  claimRef: z.string().min(1),
  carrierEstimateText: z.string().min(1),
  dryingLogText: z.string().default(""),
  photosSummary: z.string().default(""),
  contractorNotes: z.string().default(""),
});

const SYSTEM_PROMPT_V1 = `You are the drafting engine of a claims-documentation service for water and fire mitigation contractors. You receive (1) the carrier's estimate text, (2) the contractor's drying log, (3) a summary of photo evidence, and (4) contractor notes.

Your job: identify line items and scope the carrier's estimate misses or underpays, strictly grounded in the provided documents, and draft a professional supplement narrative.

Rules:
- Every finding MUST be supported by specific content in the provided documents. If support is absent, do not invent the finding.
- Cite the applicable standard for each finding: IICRC S500 sections for mitigation practice (drying days, dehumidifier/air-mover counts, containment, ATP/moisture verification, PPE, antimicrobial application), IRC/IBC or manufacturer requirements for code items.
- Equipment-day math: compare drying log days and equipment counts against what the estimate pays for; flag deltas explicitly with the arithmetic.
- Value ranges are estimates in USD based on the document contents; when the documents give no pricing basis, use null rather than guessing.
- Findings the contractor's own documents contradict must be omitted.
- The narrative is documentation the CONTRACTOR signs and submits. Neutral, factual, no advocacy language, no legal or coverage conclusions, no mention of negotiation.

Output STRICT JSON matching:
{"findings":[{"id":"f1","category":"equipment_days|missed_line_item|code_upgrade|labor|documentation_gap","title":"...","rationale":"... (quote or reference the exact source line)","citation":"IICRC S500 ...","estimatedValueUsd":[low,high] or null,"confidence":"high|medium|low"}],"narrative":"...","selfCheckNotes":["..."]}

Before returning, self-check each finding: is it grounded? Is the citation correct for the claim being made? Remove any finding that fails, and record what you removed in selfCheckNotes.`;

export const mitigationSupplementSku: SkuDef = {
  tenant: "mitigation",
  sku: "supplement-review",
  displayName: "Mitigation Supplement Review",
  description:
    "Carrier estimate + drying records in; documented, citation-backed supplement findings and narrative out.",
  inputSchema: InputSchema,
  intakeFields: [
    { key: "claimRef", label: "Claim reference", kind: "text" },
    { key: "carrierEstimateText", label: "Carrier estimate (paste text)", kind: "textarea" },
    { key: "dryingLogText", label: "Drying log (paste text)", kind: "textarea" },
    { key: "photosSummary", label: "Photo evidence summary", kind: "textarea" },
    { key: "contractorNotes", label: "Contractor notes", kind: "textarea" },
  ],
  reasonCodes: [
    { code: "not_supported_by_docs", label: "Not supported by the documents" },
    { code: "wrong_citation", label: "Citation wrong or misapplied" },
    { code: "value_wrong", label: "Value range wrong" },
    { code: "duplicate", label: "Duplicate of another finding" },
    { code: "missed_by_ai", label: "AI missed this item (reviewer added)" },
    { code: "style", label: "Tone/wording fix" },
    { code: "other", label: "Other" },
  ],
  categories: [
    "equipment_days",
    "missed_line_item",
    "code_upgrade",
    "labor",
    "documentation_gap",
  ],
  systemPromptV1: SYSTEM_PROMPT_V1,
  renderUserMessage(input: z.infer<typeof InputSchema>) {
    return [
      `CLAIM REF: ${input.claimRef}`,
      `--- CARRIER ESTIMATE ---\n${input.carrierEstimateText}`,
      `--- DRYING LOG ---\n${input.dryingLogText || "(none provided)"}`,
      `--- PHOTO EVIDENCE SUMMARY ---\n${input.photosSummary || "(none provided)"}`,
      `--- CONTRACTOR NOTES ---\n${input.contractorNotes || "(none provided)"}`,
    ].join("\n\n");
  },
  evalRubric: `A finding passes if: (a) its rationale is supported by the case input documents, (b) the citation plausibly governs the practice described, (c) it is not a duplicate, and (d) required content listed in the expectation appears in the output. The output fails a case if any mustInclude term is absent from the combined findings+narrative text, or any mustNotInclude term is present.`,
  mockDraft(input: z.infer<typeof InputSchema>): DraftOutput {
    const days = /day\s*5|5\s*days?/i.test(input.dryingLogText) ? 5 : 3;
    return {
      findings: [
        {
          id: "f1",
          category: "equipment_days",
          title: `Dehumidifier days underpaid (${days} logged vs 3 paid)`,
          rationale: `Drying log records equipment through day ${days}; the carrier estimate pays 3 days of LGR dehumidification.`,
          citation: "IICRC S500 — drying to verified moisture goals",
          estimatedValueUsd: [420, 640],
          confidence: "high",
        },
        {
          id: "f2",
          category: "missed_line_item",
          title: "Containment barrier not in estimate",
          rationale: "Photo summary shows poly containment installed; no containment line item appears in the carrier estimate.",
          citation: "IICRC S500 — engineering controls/containment",
          estimatedValueUsd: [180, 320],
          confidence: "medium",
        },
        {
          id: "f3",
          category: "documentation_gap",
          title: "Post-mitigation moisture verification not billed",
          rationale: "Drying log includes final moisture readings; verification visit is absent from the estimate.",
          citation: "IICRC S500 — verification of drying goals",
          estimatedValueUsd: null,
          confidence: "medium",
        },
      ],
      narrative:
        `Supplement request for claim ${input.claimRef}. The attached drying log documents ${days} days of active drying; the estimate of record compensates 3. The items below are documented in the contractor's records and photographs and are submitted for the carrier's review.`,
      selfCheckNotes: ["MOCK MODE: canned draft derived from fixtures — set ANTHROPIC_API_KEY for real drafting."],
    };
  },
};
