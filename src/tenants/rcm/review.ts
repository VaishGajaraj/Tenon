import { DISPOSITIONS, REJECT_REASON_CODES, type Disposition } from "./schema";
import type { DraftOutput, Finding } from "@/core/types";
import type { CorrectionEvent } from "@/core/types";

export interface RcmReviewDecision {
  finding: Finding;
  status: "accepted" | "rejected";
  reasonCode?: string;
  disposition?: Disposition;
  dispositionRationale?: string;
  note?: string;
}

export function validateRcmDecisions(decisions: RcmReviewDecision[]): string | null {
  for (const d of decisions) {
    if (d.status === "accepted") {
      if (!d.disposition || !(DISPOSITIONS as readonly string[]).includes(d.disposition)) {
        return `Accept requires a disposition (${DISPOSITIONS.join(" | ")}) on ${d.finding.id}`;
      }
      if (!d.dispositionRationale?.trim()) {
        return `Accept requires a one-sentence rationale on ${d.finding.id}`;
      }
    } else if (d.status === "rejected") {
      if (!d.reasonCode || !(REJECT_REASON_CODES as readonly string[]).includes(d.reasonCode)) {
        return `Reject requires a reason code from the closed list on ${d.finding.id}`;
      }
    }
  }
  return null;
}

export function finalizeRcmDraft(
  draft: DraftOutput,
  decisions: RcmReviewDecision[],
  workpaper: { preparer: string; reviewer: string; date: string },
): { final: DraftOutput; corrections: CorrectionEvent[]; error: string | null } {
  const err = validateRcmDecisions(decisions);
  if (err) return { final: draft, corrections: [], error: err };

  const byId = new Map(decisions.map((d) => [d.finding.id, d]));
  const accepted: Finding[] = [];
  const rejected: Finding[] = [];
  const corrections: CorrectionEvent[] = [];

  for (const orig of draft.findings) {
    const d = byId.get(orig.id);
    if (!d || d.status === "accepted") {
      const disposition = d?.disposition;
      const dispositionRationale = d?.dispositionRationale?.trim();
      accepted.push({ ...orig, disposition, dispositionRationale });
    } else {
      rejected.push({ ...orig });
      corrections.push({
        targetPath: `findings[id=${orig.id}]`,
        kind: "reject",
        reasonCode: d.reasonCode!,
        before: orig,
        after: null,
        note: d.note,
      });
    }
  }

  const dispositions: Record<string, number> = {};
  for (const f of accepted) {
    if (f.disposition) dispositions[f.disposition] = (dispositions[f.disposition] ?? 0) + 1;
  }

  const final: DraftOutput = {
    ...draft,
    findings: accepted,
    rejectedFlags: rejected,
    narrative: `${draft.narrative}\nDispositions: ${Object.entries(dispositions).map(([k, v]) => `${k}=${v}`).join(", ") || "none"}\nRejected flags retained on workpaper: ${rejected.length}`,
    workpaper: { ...workpaper, mode: "MOCK" },
    mode: "MOCK",
  };
  return { final, corrections, error: null };
}
