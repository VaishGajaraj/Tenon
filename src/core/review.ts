import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { getSku } from "@/core/sku";
import { DraftOutput, CorrectionEvent } from "@/core/types";

/**
 * Delivery of a reviewed work item. Lives in core (not the app layer) so it can
 * be exercised by scripts and tests through exactly the path the UI uses —
 * a demo that bypasses validation proves nothing about the product.
 */

export const ReviewPayload = z.object({
  itemId: z.number().int().positive(),
  runId: z.number().int().positive(),
  corrections: z.array(CorrectionEvent).max(200),
  final: DraftOutput,
  reviewSeconds: z.number().int().min(0).max(60 * 60 * 8),
  reviewerId: z.string().min(1).default("solo"),
});
export type ReviewPayload = z.infer<typeof ReviewPayload>;

export async function deliverReview(payload: unknown): Promise<{ itemId: number }> {
  const p = ReviewPayload.parse(payload);
  const db = await getDb();

  const [item] = await db.select().from(schema.workItems).where(eq(schema.workItems.id, p.itemId));
  if (!item) throw new Error("work item not found");
  const def = getSku(item.tenant, item.sku);
  const validReasons = new Set(def.reasonCodes.map((r) => r.code));

  const [run] = await db.select().from(schema.runs).where(eq(schema.runs.id, p.runId));
  if (!run || run.itemId !== p.itemId) throw new Error("run does not belong to this item");
  const drafted = DraftOutput.parse(run.output);
  const draftedIds = new Set(drafted.findings.map((f) => f.id));

  for (const c of p.corrections) {
    if (!validReasons.has(c.reasonCode)) throw new Error(`unknown reason code: ${c.reasonCode}`);
    // Corrections must reference something that was actually drafted, so the
    // ledger cannot be populated with events that never happened.
    if (c.kind !== "add") {
      const id = /findings\[id=([^\]]+)\]/.exec(c.targetPath)?.[1];
      if (id && !draftedIds.has(id)) throw new Error(`correction targets unknown finding: ${id}`);
    }
  }

  // Server-derived metrics: a number reported by the party being measured is
  // not evidence, and these numbers are the product's proof.
  const rejected = p.corrections.filter((c) => c.kind === "reject").length;
  const added = p.corrections.filter((c) => c.kind === "add").length;
  const findingsTotal = drafted.findings.length;
  const findingsAccepted = Math.max(0, findingsTotal - rejected);
  const elapsedSinceDraft = Math.floor(
    (Date.now() - new Date(run.createdAt as unknown as string).getTime()) / 1000,
  );
  const reviewSeconds = Math.max(0, Math.min(p.reviewSeconds, elapsedSinceDraft));

  await db.transaction(async (tx) => {
    // The status update IS the concurrency guard: zero rows means someone
    // already delivered this item, so the whole transaction aborts.
    const moved = await tx
      .update(schema.workItems)
      .set({
        status: "delivered",
        version: sql`${schema.workItems.version} + 1`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(schema.workItems.id, p.itemId), eq(schema.workItems.status, "in_review")))
      .returning({ id: schema.workItems.id });
    if (moved.length === 0) throw new Error("item is not in review (already delivered?)");

    for (const c of p.corrections) {
      await tx.insert(schema.corrections).values({
        orgId: item.orgId,
        itemId: p.itemId,
        runId: p.runId,
        reviewerId: p.reviewerId,
        isMock: run.isMock,
        targetPath: c.targetPath,
        kind: c.kind,
        reasonCode: c.reasonCode,
        before: c.before ?? null,
        after: c.after ?? null,
        note: c.note ?? null,
      });
    }
    await tx.insert(schema.deliverables).values({
      orgId: item.orgId,
      itemId: p.itemId,
      runId: p.runId,
      promptVersionId: run.promptVersionId,
      reviewerId: p.reviewerId,
      isMock: run.isMock,
      final: p.final,
      reviewSeconds,
      correctionCount: p.corrections.length,
      findingsTotal,
      findingsAccepted,
      findingsAdded: added,
    });
  });

  return { itemId: p.itemId };
}
