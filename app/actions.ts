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

import { redirect } from "next/navigation";
import { universeFromDroppedFiles } from "@/tenants/rcm/drop";
import type { PresetMapName } from "@/tenants/rcm/ingest";

async function fileFrom(formData: FormData, key: string): Promise<{ filename: string; bytes: Buffer } | null> {
  const v = formData.get(key);
  if (!v || typeof v === "string") return null;
  const file = v as File;
  if (!file.size) return null;
  const buf = Buffer.from(await file.arrayBuffer());
  return { filename: file.name || `${key}.xlsx`, bytes: buf };
}

export async function ingestDroppedAction(formData: FormData): Promise<void> {
  const ia = await fileFrom(formData, "ia");
  const sox = await fileFrom(formData, "sox");
  if (!ia || !sox) throw new Error("IA RCM and SOX RCM files are required");
  const rcsa = await fileFrom(formData, "rcsa");
  const presetRaw = String(formData.get("preset") || "auto");
  const preset = (
    ["auto", "generic", "auditboardish", "ia", "sox"] as const
  ).includes(presetRaw as PresetMapName | "auto")
    ? (presetRaw as PresetMapName | "auto")
    : "auto";
  const universe = universeFromDroppedFiles({
    ia,
    sox,
    rcsa: rcsa ?? undefined,
    preset,
    bankName: String(formData.get("bankName") || "Wrenbridge Community Bank, N.A."),
  });
  const preparer = String(formData.get("preparer") || "A. Sample, Internal Audit");
  const reviewer = String(formData.get("reviewer") || "B. Sample, SOX PMO");
  const db = await getDb();
  await db.insert(schema.workItems).values({
    tenant: "rcm",
    sku: "recon",
    status: "intake",
    title: `File drop — ${universe.ia.copyName} vs ${universe.sox.copyName} (MOCK)`,
    input: {
      engagementName: `File-drop MOCK recon — ${universe.ia.copyName} vs ${universe.sox.copyName}`,
      preparer,
      reviewer,
      bankName: universe.bankName,
      asOf: universe.asOf,
      universeJson: JSON.stringify(universe),
      iaRowCount: universe.ia.rows.length,
      soxRowCount: universe.sox.rows.length,
      rcsaRowCount: universe.rcsa?.rows.length ?? 0,
      ingestSource: "file-drop",
      rcsaCopyName: universe.rcsa?.copyName ?? "",
    },
  });
  revalidatePath("/recon");
  revalidatePath("/work");
  redirect("/recon");
}

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
  revalidatePath("/recon");
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
