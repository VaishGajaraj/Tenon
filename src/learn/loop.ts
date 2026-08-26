import { and, eq, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db/client";
import { getSku } from "@/core/sku";
import type { DraftOutput, PromptSnapshot, ReasonCode } from "@/core/types";
import { complete, parseJsonBlock, hasRealModel, REFLECT_MODEL } from "@/ai/provider";
import { activePromptVersion, draftWith, snapshotOf } from "@/ai/runner";

/**
 * The corrections -> improvement loop (SPEC §5):
 *  1. mine    — turn reviewer corrections into DISCRIMINATIVE eval cases.
 *  2. propose — reflect over correction clusters, draft a new prompt version.
 *  3. gate    — score proposed vs active on the HELD-OUT eval suite.
 *  4. promote — only on improvement beyond a margin, on a large enough suite.
 *
 * Three properties this file has to defend, because the product's credibility
 * rests on them:
 *  (a) cases must be able to FAIL for the current version, or they test nothing;
 *  (b) the cases used for grading must not be the ones fed to the reflector,
 *      or the gate is grading memorization;
 *  (c) more feedback can make prompts worse, so few-shots are capped and the
 *      proposal is bounded and validated before it can become active.
 */

const MAX_FEW_SHOTS = 8;
const MAX_PROMPT_GROWTH = 1.2;
/** Every Nth mined case is reserved for grading and hidden from the reflector. */
const HOLDOUT_EVERY = 3;
/** Below this many gradeable cases the gate refuses to promote at all. */
export const MIN_SUITE = Number(process.env.TENON_MIN_SUITE ?? 3);
/** Improvement must exceed this to promote (noise guard). */
export const DEFAULT_MARGIN = Number(process.env.TENON_PROMOTE_MARGIN ?? 0.02);

const ProposalSchema = z.object({
  systemPrompt: z.string().min(50),
  fewShots: z
    .array(z.object({ situation: z.string(), lesson: z.string() }))
    .max(MAX_FEW_SHOTS)
    .default([]),
  notes: z.string().default(""),
});
type Proposal = z.infer<typeof ProposalSchema>;

const STOP = new Set(["the", "and", "for", "with", "that", "this", "from", "not", "was"]);
function keyTerms(text: string, max = 6): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 4 && !STOP.has(w)),
    ),
  ).slice(0, max);
}

export interface Expectation {
  mustNotInclude?: string[];
  requireTerms?: string[];
  forbidCitationFor?: { titleTerms: string[]; citation: string };
  note?: string;
}

/** Build a discriminative expectation from a correction, per its reason code. */
export function expectationFor(
  rc: ReasonCode | undefined,
  c: { kind: string; before: unknown; after: unknown },
): Expectation | null {
  const before = c.before as any;
  const after = c.after as any;
  const mode = rc?.expectation ?? (c.kind === "reject" ? "forbid_title" : "none");
  switch (mode) {
    case "forbid_title": {
      const title = before?.title;
      return title ? { mustNotInclude: [String(title)] } : null;
    }
    case "forbid_citation": {
      const title = before?.title ?? after?.title;
      const citation = before?.citation;
      if (!title || !citation) return null;
      return { forbidCitationFor: { titleTerms: keyTerms(String(title)), citation: String(citation) } };
    }
    case "require_terms": {
      const src = after?.title ? `${after.title} ${after.rationale ?? ""}` : "";
      const terms = keyTerms(src, 4);
      return terms.length >= 2 ? { requireTerms: terms } : null;
    }
    default:
      return null;
  }
}

/** Does an output already satisfy an expectation? (the grader) */
export function gradeOutput(output: DraftOutput, exp: Expectation): { pass: boolean; why: string } {
  const whole = [
    ...output.findings.map((f) => `${f.title} ${f.rationale} ${f.citation}`),
    output.narrative,
  ]
    .join("\n")
    .toLowerCase();
  const why: string[] = [];

  for (const term of exp.mustNotInclude ?? []) {
    if (whole.includes(term.toLowerCase())) why.push(`should not include: ${term}`);
  }
  for (const term of exp.requireTerms ?? []) {
    if (!whole.includes(term.toLowerCase())) why.push(`missing term: ${term}`);
  }
  if (exp.forbidCitationFor) {
    const { titleTerms, citation } = exp.forbidCitationFor;
    const match = output.findings.find((f) =>
      titleTerms.every((t) => `${f.title}`.toLowerCase().includes(t)),
    );
    if (match && match.citation.toLowerCase() === citation.toLowerCase()) {
      why.push(`stale citation retained: ${citation}`);
    }
  }
  return { pass: why.length === 0, why: why.join("; ") || "ok" };
}

/**
 * Detect client content leaking into a learned example. Few-shots become part
 * of the shared system prompt for every future draft, so a verbatim run of
 * client text (or a claim reference) escaping into one is a contractual
 * problem, not a style problem. Returns the offending fragment, or null.
 */
export function findLeakage(
  shots: { situation: string; lesson: string }[],
  corrections: { note?: string | null; before?: unknown; after?: unknown }[],
  ngram = 40,
): string | null {
  const haystacks = shots.map((s) => `${s.situation} ${s.lesson}`);
  // Anything that looks like a claim/file reference.
  for (const h of haystacks) {
    const m = h.match(/\b[A-Z0-9]{2,}-[A-Z0-9-]{3,}\b/);
    if (m) return m[0];
  }
  // Long verbatim runs from correction payloads (which quote source documents).
  const sources: string[] = [];
  for (const c of corrections) {
    for (const v of [c.note, (c.before as any)?.rationale, (c.after as any)?.rationale]) {
      if (typeof v === "string" && v.length >= ngram) sources.push(v);
    }
  }
  for (const src of sources) {
    for (let i = 0; i + ngram <= src.length; i += 10) {
      const frag = src.slice(i, i + ngram);
      if (haystacks.some((h) => h.includes(frag))) return frag;
    }
  }
  return null;
}

/**
 * Mine corrections into eval cases. A candidate is only stored as informative
 * if the CURRENT active version actually fails it — otherwise it is a vacuous
 * always-pass case that dilutes the gate.
 */
export async function mineCorrections(
  tenant: string,
  sku: string,
): Promise<{ created: number; informative: number }> {
  const db = await getDb();
  const def = getSku(tenant, sku);
  const rcByCode = new Map(def.reasonCodes.map((r) => [r.code, r]));

  const existing: { sourceCorrectionId: number | null }[] = await db
    .select({ sourceCorrectionId: schema.evalCases.sourceCorrectionId })
    .from(schema.evalCases)
    .where(and(eq(schema.evalCases.tenant, tenant), eq(schema.evalCases.sku, sku)));
  const seen = new Set(existing.map((d) => d.sourceCorrectionId).filter(Boolean));

  const rows = await db
    .select({ c: schema.corrections, item: schema.workItems })
    .from(schema.corrections)
    .innerJoin(schema.workItems, eq(schema.corrections.itemId, schema.workItems.id))
    .where(and(eq(schema.workItems.tenant, tenant), eq(schema.workItems.sku, sku)))
    .orderBy(schema.corrections.id);

  const active = await activePromptVersion(tenant, sku);
  const snapshot = snapshotOf(active);

  let created = 0;
  let informativeCount = 0;
  let index = (await countCases(tenant, sku)) ?? 0;

  for (const { c, item } of rows as { c: any; item: any }[]) {
    if (seen.has(c.id)) continue;
    const exp = expectationFor(rcByCode.get(c.reasonCode), c);
    if (!exp) continue;

    // Validity check: if the current version already satisfies it, the case
    // tests nothing. Store it (for provenance) but mark it non-informative.
    let informative = true;
    try {
      const { output } = await draftWith(tenant, sku, snapshot, item.input);
      informative = !gradeOutput(output, exp).pass;
    } catch {
      informative = true; // can't prove vacuity — keep it, the gate handles errors
    }

    await db.insert(schema.evalCases).values({
      orgId: item.orgId ?? "default",
      tenant,
      sku,
      source: "correction",
      sourceCorrectionId: c.id,
      isMock: Boolean(c.isMock),
      informative,
      holdout: index % HOLDOUT_EVERY === 0,
      input: item.input,
      expectation: { ...exp, note: `${c.kind}:${c.reasonCode}` },
      weight: rcByCode.get(c.reasonCode)?.weight ?? 1,
    });
    created++;
    if (informative) informativeCount++;
    index++;
  }
  return { created, informative: informativeCount };
}

async function countCases(tenant: string, sku: string): Promise<number> {
  const db = await getDb();
  const rows: { id: number }[] = await db
    .select({ id: schema.evalCases.id })
    .from(schema.evalCases)
    .where(and(eq(schema.evalCases.tenant, tenant), eq(schema.evalCases.sku, sku)));
  return rows.length;
}

/**
 * Propose a new prompt version. The reflector only sees corrections whose eval
 * cases are NOT held out, so the graded suite stays unseen (train/test split).
 */
export async function proposeNewVersion(tenant: string, sku: string): Promise<number | null> {
  const db = await getDb();
  const def = getSku(tenant, sku);
  const active = await activePromptVersion(tenant, sku);

  const holdoutIds = new Set(
    (
      await db
        .select({ id: schema.evalCases.sourceCorrectionId })
        .from(schema.evalCases)
        .where(
          and(
            eq(schema.evalCases.tenant, tenant),
            eq(schema.evalCases.sku, sku),
            eq(schema.evalCases.holdout, true),
          ),
        )
    )
      .map((r: { id: number | null }) => r.id)
      .filter(Boolean),
  );

  const rows = await db
    .select({ c: schema.corrections })
    .from(schema.corrections)
    .innerJoin(schema.workItems, eq(schema.corrections.itemId, schema.workItems.id))
    .where(and(eq(schema.workItems.tenant, tenant), eq(schema.workItems.sku, sku)))
    .orderBy(desc(schema.corrections.createdAt))
    .limit(100);

  const trainable = (rows as { c: any }[]).filter((r) => !holdoutIds.has(r.c.id));
  if (trainable.length === 0) return null;

  const clusters = new Map<string, number>();
  for (const { c } of trainable) clusters.set(c.reasonCode, (clusters.get(c.reasonCode) ?? 0) + 1);
  const summary = [...clusters.entries()].map(([code, n]) => `${code}: ${n}`).join(", ");

  let proposal: Proposal;
  if (hasRealModel()) {
    const sample = trainable.slice(0, 30).map((r) => ({
      kind: r.c.kind,
      reasonCode: r.c.reasonCode,
      before: r.c.before,
      after: r.c.after,
      note: r.c.note,
    }));
    const res = await complete({
      model: REFLECT_MODEL(),
      system: `You improve the system prompt of a document-review drafting engine based on reviewer corrections. Keep the prompt's structure and output contract IDENTICAL. Make the smallest changes that would prevent the observed corrections. You may add up to ${MAX_FEW_SHOTS} short learned examples.

HARD RULES:
- Never grow the prompt by more than 20%.
- Learned examples must be GENERALIZED lessons. Never include client identifiers, claim references, addresses, dollar amounts, or verbatim quotes from source documents.
- Return STRICT JSON: {"systemPrompt":"...","fewShots":[{"situation":"...","lesson":"..."}],"notes":"what changed and why"}`,
      user: `CURRENT SYSTEM PROMPT:\n${active.systemPrompt}\n\nCURRENT LEARNED EXAMPLES:\n${JSON.stringify(active.fewShots)}\n\nCORRECTION CLUSTERS: ${summary}\n\nCORRECTIONS SAMPLE:\n${JSON.stringify(sample, null, 2)}`,
      maxTokens: 8192,
    });
    proposal = ProposalSchema.parse(parseJsonBlock(res.text));
  } else {
    // Offline: deterministic reflection from the SKU's own reason-code lessons.
    // Core knows no tenant vocabulary — ADR-3. The situation carries the
    // AI-generated titles that were corrected (never client document text), so
    // the lesson is about something specific rather than a generic platitude.
    const lessonFor = new Map(def.reasonCodes.map((r) => [r.code, r.mockLesson]));
    const titlesFor = new Map<string, Set<string>>();
    for (const { c } of trainable) {
      const t = (c.before as any)?.title ?? (c.after as any)?.title;
      if (!t) continue;
      if (!titlesFor.has(c.reasonCode)) titlesFor.set(c.reasonCode, new Set());
      titlesFor.get(c.reasonCode)!.add(String(t));
    }
    const shots = [...clusters.entries()]
      .filter(([code]) => lessonFor.get(code))
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_FEW_SHOTS)
      .map(([code, n]) => {
        const titles = [...(titlesFor.get(code) ?? [])].slice(0, 3);
        const about = titles.length ? ` Examples corrected: ${titles.join("; ")}.` : "";
        return {
          situation: `Reviewers filed ${n} correction(s) with reason "${code}".${about}`,
          lesson: lessonFor.get(code)!,
        };
      });
    if (shots.length === 0) return null;
    proposal = {
      systemPrompt: active.systemPrompt,
      fewShots: shots,
      notes: `Offline reflection: ${shots.length} learned example(s) from clusters [${summary}].`,
    };
  }

  // Mechanical leakage guard. SPEC §7 commits that client documents are not
  // used for cross-client training; few-shots are appended to the system prompt
  // of every future draft, so this must be enforced, not merely instructed.
  const leak = findLeakage(
    proposal.fewShots,
    trainable.map((r) => r.c),
  );
  if (leak) throw new Error(`Refusing proposal: learned example leaks client content ("${leak}")`);

  // Bound the proposal mechanically; the model's instruction is not enforcement.
  if (proposal.systemPrompt.length > active.systemPrompt.length * MAX_PROMPT_GROWTH) {
    throw new Error("Proposed prompt exceeds the growth bound; refusing to store.");
  }
  proposal.fewShots = proposal.fewShots.slice(0, MAX_FEW_SHOTS);

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
  return inserted.id;
}

export interface GateResult {
  passRate: number;
  total: number;
  errors: number;
}

/** Score one prompt version against the held-out, informative suite. */
export async function runEvalGate(
  tenant: string,
  sku: string,
  promptVersionId: number,
  samples = 1,
): Promise<GateResult> {
  const db = await getDb();
  const [pv] = await db
    .select()
    .from(schema.promptVersions)
    .where(
      and(
        eq(schema.promptVersions.id, promptVersionId),
        eq(schema.promptVersions.tenant, tenant),
        eq(schema.promptVersions.sku, sku),
      ),
    );
  if (!pv) throw new Error(`prompt version ${promptVersionId} not found for ${tenant}/${sku}`);

  const cases = await db
    .select()
    .from(schema.evalCases)
    .where(
      and(
        eq(schema.evalCases.tenant, tenant),
        eq(schema.evalCases.sku, sku),
        eq(schema.evalCases.informative, true),
        eq(schema.evalCases.holdout, true),
      ),
    );
  if (cases.length === 0) return { passRate: 1, total: 0, errors: 0 };

  const snapshot = snapshotOf(pv);
  const results: { caseId: number; pass: boolean; why: string }[] = [];
  let weighted = 0;
  let weightTotal = 0;
  let errors = 0;

  for (const c of cases as any[]) {
    const exp = c.expectation as Expectation;
    let passes = 0;
    let attempted = 0;
    let why = "ok";
    for (let i = 0; i < samples; i++) {
      try {
        const { output } = await draftWith(tenant, sku, snapshot, c.input);
        const g = gradeOutput(output, exp);
        attempted++;
        if (g.pass) passes++;
        else why = g.why;
      } catch (err) {
        errors++;
        why = `infrastructure error: ${String(err).slice(0, 120)}`;
      }
    }
    // Infrastructure failures are NOT graded failures — they would
    // systematically penalize whichever version is scored second.
    if (attempted === 0) continue;
    const pass = passes / attempted >= 0.5;
    results.push({ caseId: c.id, pass, why });
    weightTotal += c.weight;
    if (pass) weighted += c.weight;
  }

  const passRate = weightTotal === 0 ? 1 : weighted / weightTotal;
  await db.insert(schema.evalRuns).values({
    promptVersionId,
    results,
    passRate,
    casesScored: results.length,
  });
  return { passRate, total: results.length, errors };
}

/** Promote a proposed version only on real, measured improvement. */
export async function promoteIfBetter(
  tenant: string,
  sku: string,
  proposedId: number,
  margin = DEFAULT_MARGIN,
): Promise<{ promoted: boolean; proposed: number; active: number; total: number; reason: string }> {
  const db = await getDb();
  const [proposed] = await db
    .select()
    .from(schema.promptVersions)
    .where(
      and(
        eq(schema.promptVersions.id, proposedId),
        eq(schema.promptVersions.tenant, tenant),
        eq(schema.promptVersions.sku, sku),
        eq(schema.promptVersions.status, "proposed"),
      ),
    );
  if (!proposed) {
    throw new Error(`version ${proposedId} is not an open proposal for ${tenant}/${sku}`);
  }
  const active = await activePromptVersion(tenant, sku);

  const a = await runEvalGate(tenant, sku, active.id);
  const p = await runEvalGate(tenant, sku, proposedId);

  if (p.total < MIN_SUITE) {
    return {
      promoted: false,
      proposed: p.passRate,
      active: a.passRate,
      total: p.total,
      reason: `suite too small (${p.total} < ${MIN_SUITE} gradeable held-out cases)`,
    };
  }
  if (p.passRate <= a.passRate + margin) {
    return {
      promoted: false,
      proposed: p.passRate,
      active: a.passRate,
      total: p.total,
      reason: `no improvement beyond margin ${margin}`,
    };
  }

  // Single statement: the active/proposed swap can never leave zero active rows.
  await db.execute(
    sql`UPDATE prompt_versions
        SET status = CASE WHEN id = ${proposedId} THEN 'active' ELSE 'retired' END
        WHERE tenant = ${tenant} AND sku = ${sku}
          AND (id = ${proposedId} OR status = 'active')`,
  );
  return {
    promoted: true,
    proposed: p.passRate,
    active: a.passRate,
    total: p.total,
    reason: "improved beyond margin on held-out suite",
  };
}
