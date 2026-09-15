/**
 * Demo: accept one RCM flag (disposition + rationale) and reject one (reason
 * code). Goes through deliverReview so rejected flags persist on the workpaper.
 */
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "../src/db/client";
import { deliverReview } from "../src/core/review";
import { DraftOutput } from "../src/core/types";
import { finalizeRcmDraft } from "../src/tenants/rcm/review";

async function main() {
  const db = await getDb();
  const items = await db
    .select()
    .from(schema.workItems)
    .where(eq(schema.workItems.status, "in_review"));
  const rcm = items.filter((i) => i.tenant === "rcm");
  if (rcm.length === 0) {
    console.log("no RCM items in review — run `pnpm seed && pnpm worker` first");
    process.exit(0);
  }
  let reviewed = 0;
  for (const item of rcm) {
    const [run] = await db
      .select()
      .from(schema.runs)
      .where(eq(schema.runs.itemId, item.id))
      .orderBy(desc(schema.runs.createdAt))
      .limit(1);
    if (!run) continue;
    const draft = DraftOutput.parse(run.output);
    const accept =
      draft.findings.find((f) => f.predicate === "description_divergence") ?? draft.findings[0];
    const reject =
      draft.findings.find((f) => f.predicate === "unmatched_in_copy") ??
      draft.findings.find((f) => f.id !== accept.id)!;
    const input = item.input as { preparer?: string; reviewer?: string; asOf?: string };
    const { final, corrections, error } = finalizeRcmDraft(
      draft,
      [
        {
          finding: accept,
          status: "accepted",
          disposition: "update",
          dispositionRationale: "Align SOX control language and owner to the IA cell.",
        },
        {
          finding: reject,
          status: "rejected",
          reasonCode: "false_positive_match",
          note: "SOX scopes this control on a different inventory.",
        },
        ...draft.findings
          .filter((f) => f.id !== accept.id && f.id !== reject.id)
          .map((f) => ({
            finding: f,
            status: "accepted" as const,
            disposition: "retain" as const,
            dispositionRationale: "Confirm as documented on both copies for the MOCK demo.",
          })),
      ],
      {
        preparer: input.preparer || "A. Sample, Internal Audit",
        reviewer: input.reviewer || "B. Sample, SOX PMO",
        date: input.asOf || "2026-06-01",
      },
    );
    if (error) throw new Error(error);
    await deliverReview({
      itemId: item.id,
      runId: run.id,
      corrections,
      final,
      reviewSeconds: 480,
    });
    reviewed++;
  }
  console.log(`demo review: accepted one flag (update) and rejected one (false_positive_match) on ${reviewed} RCM item(s)`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
