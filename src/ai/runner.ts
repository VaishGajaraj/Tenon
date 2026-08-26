import { eq, and, desc, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getSku } from "@/core/sku";
import { DraftOutput } from "@/core/types";
import { complete, parseJsonBlock, DRAFT_MODEL } from "./provider";

/** Load the active prompt version for a SKU (seeded by init-db). */
export async function activePromptVersion(tenant: string, sku: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.promptVersions)
    .where(
      and(
        eq(schema.promptVersions.tenant, tenant),
        eq(schema.promptVersions.sku, sku),
        eq(schema.promptVersions.status, "active"),
      ),
    )
    .orderBy(desc(schema.promptVersions.version))
    .limit(1);
  if (!rows[0]) throw new Error(`No active prompt version for ${tenant}/${sku} — run pnpm db:init`);
  return rows[0];
}

function renderSystem(pv: { systemPrompt: string; fewShots: unknown }): string {
  const shots = Array.isArray(pv.fewShots) ? (pv.fewShots as any[]) : [];
  if (shots.length === 0) return pv.systemPrompt;
  const rendered = shots
    .map(
      (s, i) =>
        `EXAMPLE ${i + 1} (learned from reviewer corrections)\nSituation: ${s.situation}\nCorrect handling: ${s.lesson}`,
    )
    .join("\n\n");
  return `${pv.systemPrompt}\n\n--- LEARNED EXAMPLES ---\n${rendered}`;
}

/** Run the first pass for one work item: draft -> validate -> store run -> move to review. */
export async function draftItem(itemId: number): Promise<void> {
  const db = await getDb();
  const [item] = await db.select().from(schema.workItems).where(eq(schema.workItems.id, itemId));
  if (!item) throw new Error(`work item ${itemId} not found`);
  const def = getSku(item.tenant, item.sku);
  const input = def.inputSchema.parse(item.input);
  const pv = await activePromptVersion(item.tenant, item.sku);

  await db
    .update(schema.workItems)
    .set({ status: "drafting", updatedAt: sql`now()` })
    .where(eq(schema.workItems.id, itemId));

  let output: DraftOutput;
  let usage: unknown = null;
  let model = DRAFT_MODEL();
  try {
    const res = await complete({
      system: renderSystem(pv),
      user: def.renderUserMessage(input),
      model,
    });
    if (res.mocked) {
      output = def.mockDraft(input);
      model = "mock";
    } else {
      output = DraftOutput.parse(parseJsonBlock(res.text));
      usage = res.usage;
    }
  } catch (err) {
    await db
      .update(schema.workItems)
      .set({ status: "failed", updatedAt: sql`now()` })
      .where(eq(schema.workItems.id, itemId));
    throw err;
  }

  await db.insert(schema.runs).values({
    itemId,
    promptVersionId: pv.id,
    model,
    output,
    usage,
  });
  await db
    .update(schema.workItems)
    .set({ status: "in_review", updatedAt: sql`now()` })
    .where(eq(schema.workItems.id, itemId));
}

/** Claim and draft every intake item (DB-as-queue; safe to run repeatedly). */
export async function draftAllPending(): Promise<number> {
  const db = await getDb();
  const pending = await db
    .select({ id: schema.workItems.id })
    .from(schema.workItems)
    .where(eq(schema.workItems.status, "intake"));
  for (const row of pending) {
    await draftItem(row.id);
  }
  return pending.length;
}
