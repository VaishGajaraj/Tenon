import { and, eq, desc } from "drizzle-orm";
import { getDb, schema } from "../src/db/client";
import { allSkus } from "../src/core/sku";
import { CANONICAL_CONTROLS } from "../src/tenants/rcm/library";
import { DEMO_BANK } from "../src/tenants/rcm/schema";
import { generateDemoUniverse } from "../src/tenants/rcm/generate";
import { universeFromDroppedFiles } from "../src/tenants/rcm/drop";
import { toCsv, workbookToXlsx } from "../src/tenants/rcm/spreadsheet";
import { ingestWorkbook, IA_MAP, SOX_MAP } from "../src/tenants/rcm/ingest";
import { runRecon } from "../src/tenants/rcm/engine";
import { hasEmbedEndpoint, indexFactRows, retrieve } from "../src/tenants/rcm/retrieve";
import { draftRationaleWithModel } from "../src/tenants/rcm/model-share";
import { hasRealModel } from "../src/ai/provider";

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

    // 6b. Branching + retained failed attempts (governed change)
    const branches = new Set((versions as any[]).map((v) => v.branch ?? "main"));
    const scored = (versions as any[]).filter((v) => v.evalPassRate != null);
    const rejected = (versions as any[]).filter((v) => v.outcome === "rejected");
    line("branches explored", `${branches.size} (${[...branches].join(", ")})`, null);
    line(
      "failed attempts retained with scores",
      `${rejected.length} rejected, ${scored.length} scored`,
      null,
    );

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

    if (tenant === "rcm") {
      const seed = generateDemoUniverse();
      line(
        "canonical library size (bank-grade)",
        String(CANONICAL_CONTROLS.length),
        CANONICAL_CONTROLS.length >= 50,
      );
      line(
        "Wrenbridge BankFind collision",
        `${DEMO_BANK.bankfindCheck.queried} as of ${DEMO_BANK.bankfindCheck.asOf} → ${DEMO_BANK.bankfindCheck.hits} hits`,
        DEMO_BANK.fictional && DEMO_BANK.bankfindCheck.hits === 0,
      );
      const iaCsv = toCsv(seed.ia.headers, [
        ...seed.ia.rows,
        { [IA_MAP.title]: "no id" },
        { [IA_MAP.description]: "no identity" },
      ]);
      const dropped = universeFromDroppedFiles({
        ia: { filename: "ia.csv", bytes: iaCsv },
        sox: { filename: "sox.xlsx", bytes: workbookToXlsx(seed.sox) },
        rcsa: { filename: "rcsa.csv", bytes: toCsv(seed.ia.headers, seed.ia.rows.slice(0, 3)) },
      });
      line(
        "file-drop ingest (xlsx/csv + maps)",
        `${dropped.ingestReport?.maps.ia} / ${dropped.ingestReport?.maps.sox} source=${dropped.ingestReport?.source}`,
        dropped.ingestReport?.source === "file-drop" && dropped.dataMode === "MOCK",
      );
      line(
        "file-drop quarantined bad rows",
        String(dropped.ingestReport?.quarantined.length ?? 0),
        (dropped.ingestReport?.quarantined.length ?? 0) >= 2,
      );
      line(
        "optional third copy ingested",
        dropped.rcsa ? `${dropped.rcsa.copyName} ${dropped.rcsa.rows.length} rows` : "absent",
        Boolean(dropped.rcsa && dropped.rcsa.rows.length >= 3),
      );

      const { output: liveDraft, flags: liveFlags } = runRecon(seed, { systemPrompt: "", fewShots: [] });
      const liveRet = (liveDraft.mechanisms as { retrieval?: { fired?: boolean; backend?: string; citedChunkIds?: string[]; clientTextInSystemPrompt?: boolean } })
        ?.retrieval;
      line(
        "retrieval fired (fuzzy + rationale)",
        liveRet
          ? `backend=${liveRet.backend} cited=${liveRet.citedChunkIds?.length ?? 0}`
          : "unseen",
        !!liveRet?.fired && (liveRet.citedChunkIds?.length ?? 0) > 0,
      );
      line(
        "retrieval cites chunk ids (no prompt dump)",
        liveRet?.clientTextInSystemPrompt === false ? "chunk ids only" : "unseen",
        liveRet?.clientTextInSystemPrompt === false,
      );
      const keyPresent = hasRealModel() || hasEmbedEndpoint();
      if (keyPresent) {
        const iaRows = ingestWorkbook(seed.ia, IA_MAP);
        const soxRows = ingestWorkbook(seed.sox, SOX_MAP);
        const idx = indexFactRows(iaRows, soxRows);
        const fuzzy = liveFlags.find((f) => f.predicate === "needs_human_match");
        const hits = fuzzy ? retrieve(`${fuzzy.title} ${fuzzy.rationale}`, idx, 3) : [];
        const drafted = fuzzy
          ? await draftRationaleWithModel(fuzzy, hits)
          : { text: "", mocked: true };
        line(
          "retrieval real-draft path (key present)",
          hasEmbedEndpoint()
            ? `embed endpoint ${drafted.mocked ? "rationale mocked" : "rationale live"}`
            : drafted.mocked
              ? "model key present, complete() mocked-or-empty — hash hybrid still fired"
              : "model drafted rationale from chunk ids",
          liveRet?.fired === true,
        );
      } else {
        line("retrieval real-draft path (key present)", "skipped — no API key; mock hybrid still demos", null);
      }

      const mechRuns = (runs as any[]).filter((r) => r.runs.output?.mechanisms);
      const mech =
        mechRuns.find((r) => r.runs.output?.mechanisms?.ingestSource !== "file-drop")?.runs.output
          ?.mechanisms ?? mechRuns[0]?.runs.output?.mechanisms;
      const named = (mech?.namedCopies ?? []).join(", ");
      line("MOCK data mode (not REAL / not a client)", String(mech?.dataMode ?? "unseen"), mech?.dataMode === "MOCK");
      line("named copies (not Dataset A/B)", named || "unseen", named.includes("IA RCM") && named.includes("SOX RCM"));
      const ladder = mech?.identityLadder;
      line(
        "identity ladder rungs fired",
        ladder
          ? `record_id=${ladder.record_id} display_id=${ladder.display_id} content_hash=${ladder.content_hash} fuzzy_flagged=${ladder.fuzzy_flagged} auto_fuzzy=${ladder.autoMatchedFuzzy}`
          : "unseen",
        !!ladder && ladder.record_id > 0 && ladder.display_id > 0 && ladder.content_hash > 0 && ladder.fuzzy_flagged > 0 && ladder.autoMatchedFuzzy === 0,
      );
      const fired = mech?.predicatesFired ?? [];
      line("predicates that actually fired", fired.length ? fired.join(", ") : "none", fired.length >= 10);
      line(
        "frequency as attribute_mismatch (both quotes)",
        String(mech?.frequencyAsAttributeMismatch ?? 0),
        (mech?.frequencyAsAttributeMismatch ?? 0) > 0,
      );
      line(
        "test-vs-operating-frequency predicate absent",
        mech ? String(!mech.testVsOperatingFrequencyPredicate) : "unseen",
        mech ? mech.testVsOperatingFrequencyPredicate === false : false,
      );
      line(
        "unresolved evidence quarantined (not rendered)",
        String(mech?.quarantinedUnresolvedEvidence ?? "unseen"),
        mech?.quarantinedUnresolvedEvidence != null,
      );
      line("import clock is row hash (not wall clock)", String(mech?.importSetRowHashes ?? false), !!mech?.importSetRowHashes);
      const gt = (mech?.groundTruthScore ?? []) as { predicate: string; recall: number | null; precision: number | null }[];
      const gtOk = gt.length > 0 && gt.every((s) => s.recall === 1);
      line("ground_truth recall on manufactured set", gtOk ? "all predicates recall=1" : "missing or incomplete", gtOk);
      const del = (dels as any[])[0]?.d?.final;
      const hasDisp = (del?.findings ?? []).some((f: any) => f.disposition);
      const rejectedN = (del?.rejectedFlags ?? []).length;
      line("dispositions recorded on accepted flags", hasDisp ? "yes" : "no — run the demo review", hasDisp);
      line("rejected flags persisted (never deleted)", String(rejectedN), rejectedN > 0);
      line("workpaper mode MOCK", String(del?.workpaper?.mode ?? del?.mode ?? "unseen"), (del?.workpaper?.mode ?? del?.mode) === "MOCK");
      const narrative = String(del?.narrative ?? (runs as any[])[0]?.runs.output?.narrative ?? "");
      line("committee delta from code counts", narrative.includes("code-computed") ? "yes" : "no", narrative.includes("code-computed"));
      line(
        "library size recorded on run",
        String(mech?.canonicalLibrarySize ?? "unseen"),
        (mech?.canonicalLibrarySize ?? 0) >= 50,
      );
      line(
        "retrieval recorded on run",
        mech?.retrieval?.fired ? `${mech.retrieval.backend} cited=${mech.retrieval.citedChunkIds?.length ?? 0}` : "unseen — run worker",
        mech?.retrieval?.fired === true,
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
