import { eq, and, desc, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getSku } from "@/core/sku";
import { DraftOutput, type PromptSnapshot } from "@/core/types";
import { checkGrounding } from "@/core/grounding";
import { complete, parseJsonBlock, hasRealModel, DRAFT_MODEL } from "./provider";

/** Load the active prompt version for a SKU (seeded by init-db). */
export async function activePromptVersion(tenant: string, sku: string, step = "draft") {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.promptVersions)
    .where(
      and(
        eq(schema.promptVersions.tenant, tenant),
        eq(schema.promptVersions.sku, sku),
        eq(schema.promptVersions.step, step),
        eq(schema.promptVersions.status, "active"),
      ),
    )
    .orderBy(desc(schema.promptVersions.version))
    .limit(1);
  if (!rows[0]) throw new Error(`No active prompt version for ${tenant}/${sku} — run pnpm db:init`);
  return rows[0];
}

export function snapshotOf(pv: { systemPrompt: string; fewShots: unknown }): PromptSnapshot {
  return {
    systemPrompt: pv.systemPrompt,
    fewShots: Array.isArray(pv.fewShots) ? (pv.fewShots as PromptSnapshot["fewShots"]) : [],
  };
}

export function renderSystem(pv: PromptSnapshot): string {
  if (pv.fewShots.length === 0) return pv.systemPrompt;
  const rendered = pv.fewShots
    .map(
      (s, i) =>
        `EXAMPLE ${i + 1} (learned from reviewer corrections)\nSituation: ${s.situation}\nCorrect handling: ${s.lesson}`,
    )
    .join("\n\n");
  return `${pv.systemPrompt}\n\n--- LEARNED EXAMPLES ---\n${rendered}`;
}

/** Produce a draft for arbitrary input under a given prompt version. Pure — no DB writes. */
export async function draftWith(
  tenant: string,
  sku: string,
  pv: PromptSnapshot,
  input: unknown,
): Promise<{ output: DraftOutput; model: string; mocked: boolean; usage: unknown }> {
  const def = getSku(tenant, sku);
  const parsed = def.inputSchema.parse(input);
  if (!hasRealModel()) {
    return { output: def.mockDraft(parsed, pv), model: "mock", mocked: true, usage: null };
  }
  const res = await complete({
    system: renderSystem(pv),
    user: def.renderUserMessage(parsed),
    model: DRAFT_MODEL(),
  });
  return {
    output: DraftOutput.parse(parseJsonBlock(res.text)),
    model: DRAFT_MODEL(),
    mocked: false,
    usage: res.usage,
  };
}

/**
 * Run the first pass for one work item: draft -> ground-check -> store -> review.
 * Everything that can throw is inside the try so a poison-pill item is marked
 * failed rather than halting the worker forever.
 */
export async function draftItem(itemId: number): Promise<void> {
  const db = await getDb();
  const [item] = await db.select().from(schema.workItems).where(eq(schema.workItems.id, itemId));
  if (!item) throw new Error(`work item ${itemId} not found`);

  try {
    const def = getSku(item.tenant, item.sku);
    const input = def.inputSchema.parse(item.input);
    const pv = await activePromptVersion(item.tenant, item.sku);
    const { output, model, mocked, usage } = await draftWith(
      item.tenant,
      item.sku,
      snapshotOf(pv),
      input,
    );

    // Deterministic grounding check before a human ever sees it.
    const grounding = checkGrounding(def, input, output);
    const reviewed: DraftOutput = { ...output, findings: grounding.kept };

    await db.insert(schema.runs).values({
      orgId: item.orgId,
      itemId,
      promptVersionId: pv.id,
      model,
      isMock: mocked,
      output: reviewed,
      grounding: {
        results: grounding.results,
        quarantinedIds: grounding.quarantinedIds,
        draftedCount: output.findings.length,
      },
      usage,
    });
    await db
      .update(schema.workItems)
      .set({ status: "in_review", updatedAt: sql`now()` })
      .where(eq(schema.workItems.id, itemId));
  } catch (err) {
    await db
      .update(schema.workItems)
      .set({
        status: "failed",
        lastError: String(err).slice(0, 2000),
        attempts: sql`${schema.workItems.attempts} + 1`,
        updatedAt: sql`now()`,
      })
      .where(eq(schema.workItems.id, itemId));
    throw err;
  }
}

/**
 * Claim and draft pending items. The claim is the SELECT: a single atomic
 * UPDATE ... RETURNING moves rows to `drafting`, so two workers (or a worker
 * and the UI button) cannot double-draft and double-bill the same item.
 * One item's failure never aborts the batch.
 */
export async function draftAllPending(limit = 25): Promise<{ ok: number; failed: number }> {
  const db = await getDb();
  const claimed: { id: number }[] = await db.execute(
    sql`UPDATE work_items SET status = 'drafting', updated_at = now()
        WHERE id IN (
          SELECT id FROM work_items
          WHERE status IN ('intake','failed') AND attempts < 3
          ORDER BY created_at
          LIMIT ${limit}
        )
        RETURNING id`,
  ) as unknown as { id: number }[];

  const rows = Array.isArray(claimed) ? claimed : ((claimed as any)?.rows ?? []);
  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await draftItem(row.id);
      ok++;
    } catch (err) {
      failed++;
      console.error(`item ${row.id} failed:`, String(err).slice(0, 300));
    }
  }
  return { ok, failed };
}
