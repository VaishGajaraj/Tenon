/**
 * Demo: simulate a reviewer rejecting one ungrounded finding and delivering.
 * Goes through the real submitReview path so the demo exercises validation,
 * the transaction, and server-side metric derivation — not a shortcut around them.
 */
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "../src/db/client";
import { deliverReview } from "../src/core/review";
import { DraftOutput } from "../src/core/types";

async function main() {
  const db = await getDb();
  const items = await db
    .select()
    .from(schema.workItems)
    .where(eq(schema.workItems.status, "in_review"));
  if (items.length === 0) {
    console.log("no items in review — run `pnpm seed && pnpm worker` first");
    process.exit(0);
  }
  let reviewed = 0;
  for (const item of items) {
    const [run] = await db
      .select()
      .from(schema.runs)
      .where(eq(schema.runs.itemId, item.id))
      .orderBy(desc(schema.runs.createdAt))
      .limit(1);
    if (!run) continue;
    const draft = DraftOutput.parse(run.output);
    const target = draft.findings.find((f) => /containment/i.test(f.title));
    if (!target) continue;

    await deliverReview({
      itemId: item.id,
      runId: run.id,
      corrections: [
        {
          targetPath: `findings[id=${target.id}]`,
          kind: "reject",
          reasonCode: "not_supported_by_docs",
          before: target,
          after: null,
          note: "photos referenced but not attached to this claim file",
        },
      ],
      final: { ...draft, findings: draft.findings.filter((f) => f.id !== target.id) },
      reviewSeconds: 420,
    });
    reviewed++;
  }
  console.log(`demo review: rejected the containment finding on ${reviewed} item(s) and delivered them`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
