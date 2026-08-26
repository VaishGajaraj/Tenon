"use server";

import { eq, and, sql, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db/client";
import { getSku } from "@/core/sku";
import { draftItem } from "@/ai/runner";
import { deliverReview } from "@/core/review";

/**
 * Thin transport layer: validation and business rules live in src/core and
 * src/ai so scripts and tests exercise the same code paths the UI does.
 *
 * NOTE (v0.1): these actions are unauthenticated. Next.js server actions are
 * public POST endpoints — before this is reachable from anything but localhost
 * it needs a session gate, a per-action authorization check, and a rate limit
 * on runDraftAction (which spends money). Tracked in SPEC §8.
 */

export async function createWorkItem(formData: FormData): Promise<void> {
  const tenant = String(formData.get("tenant"));
  const sku = String(formData.get("sku"));
  const def = getSku(tenant, sku); // throws on an unknown tenant/sku pair
  const raw: Record<string, string> = {};
  for (const f of def.intakeFields) raw[f.key] = String(formData.get(f.key) ?? "");
  const input = def.inputSchema.parse(raw);
  const db = await getDb();
  await db.insert(schema.workItems).values({
    tenant: def.tenant,
    sku: def.sku,
    status: "intake",
    title: `${def.displayName} — ${raw[def.intakeFields[0].key] || "untitled"}`,
    input,
  });
  revalidatePath("/work");
}

export async function runDraftAction(itemId: number): Promise<void> {
  const db = await getDb();
  // Only draft from a draftable state, atomically — no re-drafting a delivered item.
  const claimed = await db
    .update(schema.workItems)
    .set({ status: "drafting", updatedAt: sql`now()` })
    .where(
      and(eq(schema.workItems.id, itemId), sql`${schema.workItems.status} IN ('intake','failed')`),
    )
    .returning({ id: schema.workItems.id });
  if (claimed.length === 0) return; // someone else has it, or it is past drafting
  await draftItem(itemId);
  revalidatePath("/work");
  revalidatePath(`/work/${itemId}`);
}

export async function submitReview(payload: unknown): Promise<void> {
  const { itemId } = await deliverReview(payload);
  revalidatePath("/work");
  revalidatePath(`/work/${itemId}`);
  revalidatePath("/");
}

/** Latest run for an item (used by the review page). */
export async function latestRun(itemId: number) {
  const db = await getDb();
  const [run] = await db
    .select()
    .from(schema.runs)
    .where(eq(schema.runs.itemId, itemId))
    .orderBy(desc(schema.runs.createdAt))
    .limit(1);
  return run ?? null;
}
