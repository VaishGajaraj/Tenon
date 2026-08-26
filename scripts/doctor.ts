import { and, eq, desc } from "drizzle-orm";
import { getDb, schema } from "../src/db/client";
import { allSkus } from "../src/core/sku";

/**
 * `pnpm selfcheck` — does each mechanism ACTUALLY FIRE?
 *
 * This exists because of the single most instructive artifact in the agent
 * ecosystem: the FAILURE_ANALYSIS.md of irys-stateful-swarms, whose authors
 * measured their own system and found that its distinctive machinery —
 * contradiction detection, confidence decay, signal closure, early convergence —
 * never fired in production runs. 0 of 27,549 entries had a cross-reference.
 * 0 of 18,845 signals were ever closed. The architecture diagram was real; the
 * behavior was not.
 *
 * Every mechanism Tenon claims is checked here. A mechanism that has never
 * fired is either dead code or a false claim in the pitch, and both are worth
 * knowing before a customer finds out.
 */

function line(label: string, value: string, ok: boolean | null = null) {
  const mark = ok === null ? " " : ok ? "✓" : "✗";
  console.log(`  ${mark} ${label.padEnd(42)} ${value}`);
}

async function main() {
  const db = await getDb();
  for (const def of allSkus()) {
    const { tenant, sku } = def;
    console.log(`\n${tenant}/${sku}`);

    const runs = await db
      .select()
      .from(schema.runs)
      .innerJoin(schema.workItems, eq(schema.runs.itemId, schema.workItems.id))
      .where(and(eq(schema.workItems.tenant, tenant), eq(schema.workItems.sku, sku)));
    const corrections = await db
      .select({ c: schema.corrections })
      .from(schema.corrections)
      .innerJoin(schema.workItems, eq(schema.corrections.itemId, schema.workItems.id))
      .where(and(eq(schema.workItems.tenant, tenant), eq(schema.workItems.sku, sku)));
    const cases = await db
      .select()
      .from(schema.evalCases)
      .where(and(eq(schema.evalCases.tenant, tenant), eq(schema.evalCases.sku, sku)));
    const versions = await db
      .select()
      .from(schema.promptVersions)
      .where(and(eq(schema.promptVersions.tenant, tenant), eq(schema.promptVersions.sku, sku)))
      .orderBy(desc(schema.promptVersions.version));
    const evalRuns = await db.select().from(schema.evalRuns);

    // 1. Drafting
    const mockRuns = (runs as any[]).filter((r) => r.runs.is_mock ?? r.runs.isMock).length;
    line("runs recorded", `${runs.length} (${mockRuns} mock)`, runs.length > 0);

    // 2. Grounding check (adopted from swarms' source custody)
    const withGrounding = (runs as any[]).filter((r) => r.runs.grounding).length;
    const quarantined = (runs as any[]).reduce(
      (a, r) => a + ((r.runs.grounding?.quarantinedIds ?? []).length as number),
      0,
    );
    line(
      "grounding check ran / quarantined",
      `${withGrounding} runs / ${quarantined} findings`,
      withGrounding > 0,
    );
    if (withGrounding > 0 && quarantined === 0) {
      line("  ↳ note", "never fired yet — unproven, not necessarily broken", null);
    }

    // 3. Correction capture
    const byReason = new Map<string, number>();
    for (const { c } of corrections as any[]) {
      byReason.set(c.reasonCode, (byReason.get(c.reasonCode) ?? 0) + 1);
    }
    line(
      "corrections captured",
      corrections.length === 0
        ? "0"
        : `${corrections.length} across ${byReason.size} reason code(s)`,
      corrections.length > 0,
    );
    const unusedCodes = def.reasonCodes.filter((r) => !byReason.has(r.code)).map((r) => r.code);
    if (unusedCodes.length) line("  ↳ never-used reason codes", unusedCodes.join(", "), null);

    // 4. Mining — the vacuity check is the point
    const informative = (cases as any[]).filter((c) => c.informative).length;
    const holdout = (cases as any[]).filter((c) => c.holdout && c.informative).length;
    line(
      "eval cases mined (informative)",
      `${cases.length} (${informative} informative, ${holdout} gradeable held-out)`,
      cases.length === 0 || informative > 0,
    );
    if (cases.length > 0 && informative === 0) {
      line("  ↳ WARNING", "every mined case is vacuous — the gate tests nothing", false);
    }

    // 5. The gate
    const promotions = versions.filter((v: any) => v.version > 1);
    const activeV = versions.find((v: any) => v.status === "active") as any;
    line(
      "prompt versions / active",
      `${versions.length} versions, active = v${activeV?.version ?? "?"}`,
      versions.length > 0,
    );
    line(
      "eval gate has been scored",
      `${evalRuns.length} scoring run(s)`,
      evalRuns.length > 0,
    );
    const everPromoted = (activeV?.version ?? 1) > 1;
    line(
      "gate has ever PROMOTED a version",
      everPromoted ? "yes" : "no — the loop has never closed",
      everPromoted,
    );
    if (promotions.length > 0 && !everPromoted) {
      line("  ↳ note", `${promotions.length} proposal(s) made, none promoted`, null);
    }

    // 6. Learned examples actually in use
    const shots = Array.isArray(activeV?.fewShots) ? activeV.fewShots.length : 0;
    line("learned examples in the active prompt", String(shots), shots > 0);

    // 7. Deliverables and the counterweight
    const dels = await db
      .select({ d: schema.deliverables })
      .from(schema.deliverables)
      .innerJoin(schema.workItems, eq(schema.deliverables.itemId, schema.workItems.id))
      .where(and(eq(schema.workItems.tenant, tenant), eq(schema.workItems.sku, sku)));
    const added = (dels as any[]).reduce((a, r) => a + (r.d.findingsAdded ?? 0), 0);
    line(
      "reviewer-added findings (miss signal)",
      `${added} across ${dels.length} deliverable(s)`,
      null,
    );
    if (dels.length >= 5 && added === 0) {
      line(
        "  ↳ WARNING",
        "no misses ever recorded — recall is unmeasured, so falling corrections may just mean a quieter model",
        false,
      );
    }
  }
  console.log(
    "\nA mechanism that has never fired is a claim you cannot make. Re-run after every batch.\n",
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
