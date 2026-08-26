"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db/client";
import { getSku } from "@/core/sku";
import { draftItem } from "@/ai/runner";
import type { CorrectionEvent, DraftOutput } from "@/core/types";

export async function createWorkItem(formData: FormData): Promise<void> {
  const tenant = String(formData.get("tenant"));
  const sku = String(formData.get("sku"));
  const def = getSku(tenant, sku);
  const raw: Record<string, string> = {};
  for (const f of def.intakeFields) raw[f.key] = String(formData.get(f.key) ?? "");
  const input = def.inputSchema.parse(raw);
  const db = await getDb();
  await db.insert(schema.workItems).values({
    tenant,
    sku,
    status: "intake",
    title: `${def.displayName} — ${raw[def.intakeFields[0].key] || "untitled"}`,
    input,
  });
  revalidatePath("/work");
}

export async function runDraftAction(itemId: number): Promise<void> {
  await draftItem(itemId);
  revalidatePath("/work");
  revalidatePath(`/work/${itemId}`);
}

export async function submitReview(payload: {
  itemId: number;
  runId: number;
  corrections: CorrectionEvent[];
  final: DraftOutput;
  reviewSeconds: number;
  findingsTotal: number;
  findingsAccepted: number;
}): Promise<void> {
  const db = await getDb();
  for (const c of payload.corrections) {
    await db.insert(schema.corrections).values({
      itemId: payload.itemId,
      runId: payload.runId,
      targetPath: c.targetPath,
      kind: c.kind,
      reasonCode: c.reasonCode,
      before: c.before ?? null,
      after: c.after ?? null,
      note: c.note ?? null,
    });
  }
  await db.insert(schema.deliverables).values({
    itemId: payload.itemId,
    final: payload.final,
    reviewSeconds: payload.reviewSeconds,
    correctionCount: payload.corrections.length,
    findingsTotal: payload.findingsTotal,
    findingsAccepted: payload.findingsAccepted,
  });
  await db
    .update(schema.workItems)
    .set({ status: "delivered", updatedAt: sql`now()` })
    .where(eq(schema.workItems.id, payload.itemId));
  revalidatePath("/work");
  revalidatePath("/");
}
