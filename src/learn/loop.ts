import { and, eq, desc, gt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getSku } from "@/core/sku";
import { DraftOutput } from "@/core/types";
import {
  complete,
  parseJsonBlock,
  hasRealModel,
  REFLECT_MODEL,
} from "@/ai/provider";
import { activePromptVersion } from "@/ai/runner";

/**
 * The corrections -> improvement loop (SPEC §5):
 *  1. mine   — turn reviewer corrections into eval cases (regression suite).
 *  2. propose — reflect over correction clusters, draft a new prompt version.
 *  3. gate   — score proposed vs active on the eval suite.
 *  4. promote — only behind the gate, explicitly, with rollback available.
 * Non-negotiables: immutable versions; more feedback can make things WORSE
 * (Decagon: 500 examples degraded GEPA), so the gate is mandatory and
 * few-shot count is capped.
 */

const MAX_FEW_SHOTS = 8;

export async function mineCorrections(tenant: string, sku: string): Promise<number> {
  const db = await getDb();
  const done: { sourceCorrectionId: number | null }[] = await db
    .select({ sourceCorrectionId: schema.evalCases.sourceCorrectionId })
    .from(schema.evalCases)
    .where(and(eq(schema.evalCases.tenant, tenant), eq(schema.evalCases.sku, sku)));
  const seen = new Set(done.map((d) => d.sourceCorrectionId).filter(Boolean));

  const rows = await db
    .select({
      c: schema.corrections,
      item: schema.workItems,
    })
    .from(schema.corrections)
    .innerJoin(schema.workItems, eq(schema.corrections.itemId, schema.workItems.id))
    .where(and(eq(schema.workItems.tenant, tenant), eq(schema.workItems.sku, sku)));

  let created = 0;
  for (const { c, item } of rows) {
    if (seen.has(c.id)) continue;
    const expectation: Record<string, unknown> = { note: `${c.kind}:${c.reasonCode}` };
    if (c.kind === "reject") {
      const before = c.before as any;
      const key = before?.title || before?.citation;
      if (key) expectation.mustNotInclude = [String(key)];
    } else {
      const after = c.after as any;
      const key = after?.title || (typeof after === "string" ? null : after?.citation);
      if (key) expectation.mustInclude = [String(key)];
    }
    if (!expectation.mustInclude && !expectation.mustNotInclude) continue; // narrative style edits: skip v1
    await db.insert(schema.evalCases).values({
      tenant,
      sku,
      source: "correction",
      sourceCorrectionId: c.id,
      input: item.input,
      expectation,
      weight: c.reasonCode === "style" ? 0.25 : 1,
    });
    created++;
  }
  return created;
}

interface Proposal {
  systemPrompt: string;
  fewShots: { situation: string; lesson: string }[];
  notes: string;
}

export async function proposeNewVersion(tenant: string, sku: string): Promise<number | null> {
  const db = await getDb();
  const def = getSku(tenant, sku);
  const active = await activePromptVersion(tenant, sku);

  const rows = await db
    .select({ c: schema.corrections })
    .from(schema.corrections)
    .innerJoin(schema.workItems, eq(schema.corrections.itemId, schema.workItems.id))
    .where(and(eq(schema.workItems.tenant, tenant), eq(schema.workItems.sku, sku)))
    .orderBy(desc(schema.corrections.createdAt))
    .limit(100);
  if (rows.length === 0) return null;

  const clusters = new Map<string, number>();
  for (const { c } of rows) clusters.set(c.reasonCode, (clusters.get(c.reasonCode) ?? 0) + 1);
  const summary = [...clusters.entries()]
    .map(([code, n]) => `${code}: ${n}`)
    .join(", ");

  let proposal: Proposal;
  if (hasRealModel()) {
    const correctionsSample = rows.slice(0, 30).map((r: { c: typeof schema.corrections.$inferSelect }) => ({
      kind: r.c.kind,
      reasonCode: r.c.reasonCode,
      before: r.c.before,
      after: r.c.after,
      note: r.c.note,
    }));
    const res = await complete({
      model: REFLECT_MODEL(),
      system: `You improve the system prompt of a document-review drafting engine based on reviewer corrections. Keep the prompt's structure and output contract IDENTICAL. Make the smallest changes that would prevent the observed corrections. You may also add up to ${MAX_FEW_SHOTS} short learned examples. Never grow the prompt by more than 20%. Return STRICT JSON: {"systemPrompt":"...","fewShots":[{"situation":"...","lesson":"..."}],"notes":"what changed and why"}`,
      user: `CURRENT SYSTEM PROMPT:\n${active.systemPrompt}\n\nCURRENT LEARNED EXAMPLES:\n${JSON.stringify(active.fewShots)}\n\nCORRECTION CLUSTERS: ${summary}\n\nCORRECTIONS SAMPLE:\n${JSON.stringify(correctionsSample, null, 2)}`,
      maxTokens: 8192,
    });
    proposal = parseJsonBlock(res.text) as Proposal;
  } else {
    // Offline heuristic: convert the most common non-style correction clusters
    // into learned examples appended to the active prompt (demoable end-to-end).
    const shots = [...clusters.entries()]
      .filter(([code]) => code !== "style")
      .slice(0, MAX_FEW_SHOTS)
      .map(([code, n]) => ({
        situation: `Reviewers filed ${n} correction(s) with reason "${code}".`,
        lesson:
          code === "not_supported_by_docs"
            ? "Only include findings you can quote from the provided documents."
            : code === "missed_by_ai"
              ? "Re-scan drying logs and photo summaries for scope the estimate omits before finalizing."
              : `Avoid the failure pattern behind "${code}".`,
      }));
    proposal = {
      systemPrompt: active.systemPrompt,
      fewShots: shots,
      notes: `MOCK reflection: appended ${shots.length} learned example(s) from clusters [${summary}].`,
    };
  }

  proposal.fewShots = (proposal.fewShots ?? []).slice(0, MAX_FEW_SHOTS);
  // Retire stale proposals so there is at most one open proposal per SKU,
  // and number the new version after the global max (no duplicate versions).
  await db
    .update(schema.promptVersions)
    .set({ status: "retired" })
    .where(
      and(
        eq(schema.promptVersions.tenant, tenant),
        eq(schema.promptVersions.sku, sku),
        eq(schema.promptVersions.status, "proposed"),
      ),
    );
  const all: { version: number }[] = await db
    .select({ version: schema.promptVersions.version })
    .from(schema.promptVersions)
    .where(and(eq(schema.promptVersions.tenant, tenant), eq(schema.promptVersions.sku, sku)));
  const nextVersion = Math.max(...all.map((r) => r.version), 0) + 1;
  const [inserted] = await db
    .insert(schema.promptVersions)
    .values({
      tenant,
      sku,
      version: nextVersion,
      status: "proposed",
      systemPrompt: proposal.systemPrompt,
      fewShots: proposal.fewShots,
      notes: proposal.notes,
      parentId: active.id,
    })
    .returning({ id: schema.promptVersions.id });
  void def;
  return inserted.id;
}

function textOf(output: DraftOutput): string {
  return [
    ...output.findings.map((f) => `${f.title} ${f.rationale} ${f.citation}`),
    output.narrative,
  ]
    .join("\n")
    .toLowerCase();
}

async function draftForEval(
  tenant: string,
  sku: string,
  pv: { systemPrompt: string; fewShots: unknown },
  input: unknown,
): Promise<DraftOutput> {
  const def = getSku(tenant, sku);
  if (!hasRealModel()) return def.mockDraft(def.inputSchema.parse(input));
  const shots = Array.isArray(pv.fewShots) ? (pv.fewShots as any[]) : [];
  const system =
    shots.length === 0
      ? pv.systemPrompt
      : `${pv.systemPrompt}\n\n--- LEARNED EXAMPLES ---\n${shots
          .map((s, i) => `EXAMPLE ${i + 1}\nSituation: ${s.situation}\nCorrect handling: ${s.lesson}`)
          .join("\n\n")}`;
  const res = await complete({
    model: process.env.TENON_DRAFT_MODEL || "claude-sonnet-4-5",
    system,
    user: def.renderUserMessage(def.inputSchema.parse(input)),
  });
  return DraftOutput.parse(parseJsonBlock(res.text));
}

export async function runEvalGate(
  tenant: string,
  sku: string,
  promptVersionId: number,
): Promise<{ passRate: number; total: number }> {
  const db = await getDb();
  const [pv] = await db
    .select()
    .from(schema.promptVersions)
    .where(eq(schema.promptVersions.id, promptVersionId));
  if (!pv) throw new Error(`prompt version ${promptVersionId} not found`);

  const cases = await db
    .select()
    .from(schema.evalCases)
    .where(and(eq(schema.evalCases.tenant, tenant), eq(schema.evalCases.sku, sku)));
  if (cases.length === 0) return { passRate: 1, total: 0 };

  const results: { caseId: number; pass: boolean; why: string }[] = [];
  let weighted = 0;
  let weightTotal = 0;
  for (const c of cases) {
    const exp = c.expectation as {
      mustInclude?: string[];
      mustNotInclude?: string[];
    };
    let pass = true;
    const why: string[] = [];
    try {
      const out = await draftForEval(tenant, sku, pv, c.input);
      const text = textOf(out);
      for (const term of exp.mustInclude ?? []) {
        if (!text.includes(term.toLowerCase())) {
          pass = false;
          why.push(`missing: ${term}`);
        }
      }
      for (const term of exp.mustNotInclude ?? []) {
        if (text.includes(term.toLowerCase())) {
          pass = false;
          why.push(`should not include: ${term}`);
        }
      }
    } catch (err) {
      pass = false;
      why.push(`draft error: ${String(err)}`);
    }
    results.push({ caseId: c.id, pass, why: why.join("; ") || "ok" });
    weightTotal += c.weight;
    if (pass) weighted += c.weight;
  }
  const passRate = weightTotal === 0 ? 1 : weighted / weightTotal;
  await db.insert(schema.evalRuns).values({ promptVersionId, results, passRate });
  return { passRate, total: cases.length };
}

/** Promote a proposed version if it beats the active version on the gate. */
export async function promoteIfBetter(
  tenant: string,
  sku: string,
  proposedId: number,
  margin = 0,
): Promise<{ promoted: boolean; proposed: number; active: number }> {
  const db = await getDb();
  const active = await activePromptVersion(tenant, sku);
  const a = await runEvalGate(tenant, sku, active.id);
  const p = await runEvalGate(tenant, sku, proposedId);
  // Promotion requires strict improvement on a non-empty suite. No signal, no change:
  // ties (including 0-vs-0 and empty-suite 1-vs-1) keep the active version.
  if (p.total > 0 && p.passRate > a.passRate + margin) {
    await db
      .update(schema.promptVersions)
      .set({ status: "retired" })
      .where(eq(schema.promptVersions.id, active.id));
    await db
      .update(schema.promptVersions)
      .set({ status: "active" })
      .where(eq(schema.promptVersions.id, proposedId));
    return { promoted: true, proposed: p.passRate, active: a.passRate };
  }
  return { promoted: false, proposed: p.passRate, active: a.passRate };
}
