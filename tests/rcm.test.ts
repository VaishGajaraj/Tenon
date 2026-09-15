import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateDemoUniverse } from "../src/tenants/rcm/generate";
import { ingestWorkbook, IA_MAP, SOX_MAP, rowHashOf } from "../src/tenants/rcm/ingest";
import { identityLadder, normalizeDisplayId } from "../src/tenants/rcm/identity";
import { runPredicates, FORBIDDEN_FREQUENCY_CONFLICT } from "../src/tenants/rcm/predicates";
import { runRecon, scoreAgainstGroundTruth } from "../src/tenants/rcm/engine";
import { committeeDeltaText, committeeCounts } from "../src/tenants/rcm/committee";
import { finalizeRcmDraft } from "../src/tenants/rcm/review";
import { buildWorkpaperXlsx, workpaperSheets } from "../src/tenants/rcm/xlsx";
import { PREDICATES } from "../src/tenants/rcm/schema";
import { rcmReconSku as sku } from "../src/tenants/rcm/sku";
import { checkGrounding } from "../src/core/grounding";
import type { PromptSnapshot } from "../src/core/types";

const EMPTY: PromptSnapshot = { systemPrompt: sku.systemPromptV1, fewShots: [] };

function prepared() {
  const universe = generateDemoUniverse();
  const ia = ingestWorkbook(universe.ia, IA_MAP);
  const sox = ingestWorkbook(universe.sox, SOX_MAP);
  const priorSox = ingestWorkbook(universe.priorSox, SOX_MAP);
  const ladder = identityLadder(ia, sox);
  const pred = runPredicates({
    asOf: universe.asOf,
    directory: universe.directory,
    risks: universe.risks,
    issues: universe.issues,
    triggers: universe.triggers,
    ia,
    sox,
    priorSox,
    auto: ladder.auto,
    fuzzy: ladder.fuzzy,
    unmatchedIa: ladder.unmatchedIa,
    unmatchedSox: ladder.unmatchedSox,
  });
  return { universe, ia, sox, priorSox, ladder, ...pred };
}

test("generator records a ground-truth entry for every predicate", () => {
  const u = generateDemoUniverse();
  const covered = new Set(u.groundTruth.map((g) => g.predicate));
  for (const p of PREDICATES) {
    assert.ok(covered.has(p), `ground_truth missing ${p}`);
  }
  assert.equal(u.dataMode, "MOCK");
  assert.equal(u.ia.copyName, "IA RCM");
  assert.equal(u.sox.copyName, "SOX RCM");
  assert.ok(!/Dataset [AB]/i.test(u.ia.copyName));
});

test("column-map ingest preserves named copies and uses row hashes as the clock", () => {
  const { ia, sox, universe } = prepared();
  assert.ok(ia.length > 10);
  assert.ok(sox.length > 10);
  assert.equal(ia[0].copy, "IA RCM");
  assert.equal(sox[0].copy, "SOX RCM");
  assert.equal(ia[0].rowHash.length, 64);
  const again = rowHashOf(ia[0]);
  assert.equal(again, ia[0].rowHash);
  assert.equal(universe.asOf, "2026-06-01");
});

test("identity ladder never auto-matches a fuzzy pair", () => {
  const { ladder } = prepared();
  assert.equal(ladder.autoMatchedFuzzy, 0);
  assert.ok(ladder.rungCounts.record_id >= 1, "record_id rung must fire");
  assert.ok(ladder.rungCounts.display_id >= 1, "display_id rung must fire");
  assert.ok(ladder.rungCounts.content_hash >= 1, "content_hash rung must fire");
  assert.ok(ladder.rungCounts.fuzzy_flagged >= 1, "fuzzy must be flagged");
  assert.ok(ladder.auto.every((m) => m.method === "record_id" || m.method === "display_id" || m.method === "content_hash"));
  assert.ok(
    ladder.fuzzy.some((f) => f.ia.displayId === "ITGC-CP-01" && f.sox.displayId === "SOX-BCP-07"),
    "BCP pair should be a human match, not auto",
  );
});

test("normalizeDisplayId collapses filler zeros without merging PE-01 and PE-01A", () => {
  assert.equal(normalizeDisplayId("ITGC-AU-02"), normalizeDisplayId("ITGC-AU-2"));
  assert.notEqual(normalizeDisplayId("ITGC-PE-01"), normalizeDisplayId("ITGC-PE-01A"));
});

test("every manufactured predicate actually fires, with two resolved locators", () => {
  const { flags, quarantined, universe } = prepared();
  assert.equal(quarantined.length, 0, "demo evidence must resolve");
  const fired = new Set(flags.map((f) => f.predicate));
  for (const p of PREDICATES) {
    assert.ok(fired.has(p), `predicate ${p} did not fire`);
  }
  for (const f of flags) {
    assert.equal(f.locators.length, 2);
    assert.ok(f.locators.every((l) => l.resolved), f.id);
  }
  const scores = scoreAgainstGroundTruth(flags, universe.groundTruth);
  for (const s of scores) {
    assert.equal(s.recall, 1, `${s.predicate} recall ${s.recall} (expected ${s.expected} got tp ${s.truePositives} pred ${s.predicted})`);
  }
});

test("keyed miss is unmatched_in_copy for ITGC-PS-01 (VLOOKUP-class)", () => {
  const { flags } = prepared();
  const miss = flags.find((f) => f.predicate === "unmatched_in_copy" && f.iaDisplayId === "ITGC-PS-01");
  assert.ok(miss, "IA-only termination control must flag");
  assert.match(miss!.rationale, /VLOOKUP/i);
});

test("semantic flag quotes the source cell for drifted wording/owner", () => {
  const { flags } = prepared();
  const desc = flags.find((f) => f.predicate === "description_divergence" && f.iaDisplayId === "ITGC-AC-02");
  assert.ok(desc);
  assert.ok(desc!.quotes.left.length > 20);
  assert.ok(desc!.quotes.right.length > 20);
  assert.notEqual(desc!.quotes.left, desc!.quotes.right);
  assert.ok(desc!.rationale.includes(desc!.quotes.left.slice(0, 40)));
});

test("frequency is an attribute_mismatch quoting both values, never a conflict predicate", () => {
  const { flags } = prepared();
  const freq = flags.find((f) => f.predicate === "attribute_mismatch" && f.field === "frequency");
  assert.ok(freq);
  assert.equal(freq!.quotes.left, "Quarterly");
  assert.equal(freq!.quotes.right, "Monthly");
  assert.match(freq!.rationale, /Quarterly/);
  assert.match(freq!.rationale, /Monthly/);
  assert.doesNotMatch(freq!.rationale, /operating-frequency conflict/i);
  assert.doesNotMatch(freq!.rationale, /test-frequency vs/i);
  assert.ok(!(PREDICATES as readonly string[]).includes("test_vs_operating_frequency"));
  const src = readFileSync(new URL("../src/tenants/rcm/predicates.ts", import.meta.url), "utf8");
  assert.equal(/\bexport function \w*test\w*operating/i.test(src), false);
  assert.ok(!flags.some((f) => /test.?vs.?operating/i.test(f.predicate)));
});

test("committee delta is arithmetic, not model prose", () => {
  const { flags, quarantined, ia, sox, ladder } = prepared();
  const counts = committeeCounts({
    flags,
    quarantined: quarantined.length,
    iaRowCount: ia.length,
    soxRowCount: sox.length,
    autoMatches: ladder.auto.length,
    fuzzyFlagged: ladder.fuzzy.length,
    autoMatchedFuzzy: ladder.autoMatchedFuzzy,
  });
  const text = committeeDeltaText("Wrenbridge Community Bank, N.A.", "2026-06-01", { ia: "IA RCM", sox: "SOX RCM" }, counts);
  assert.match(text, /Flags \(code-computed\): \d+/);
  assert.match(text, /not model narrative/);
  assert.doesNotMatch(text, /in my opinion/i);
  assert.equal(counts.frequencyAttributeMismatches >= 1, true);
});

test("accept requires disposition + rationale; reject persists on rejected-flags", () => {
  const { output } = runRecon(generateDemoUniverse(), EMPTY);
  const keep = output.findings.find((f) => f.predicate === "description_divergence")!;
  const drop = output.findings.find((f) => f.predicate === "unmatched_in_copy")!;
  const bad = finalizeRcmDraft(output, [{ finding: keep, status: "accepted" }], {
    preparer: "A",
    reviewer: "B",
    date: "2026-06-01",
  });
  assert.ok(bad.error);

  const ok = finalizeRcmDraft(
    output,
    [
      {
        finding: keep,
        status: "accepted",
        disposition: "update",
        dispositionRationale: "Align SOX wording to the IA cell and recertify the owner.",
      },
      { finding: drop, status: "rejected", reasonCode: "false_positive_match", note: "SOX scopes HR separately." },
      ...output.findings
        .filter((f) => f.id !== keep.id && f.id !== drop.id)
        .map((f) => ({
          finding: f,
          status: "accepted" as const,
          disposition: "retain" as const,
          dispositionRationale: "Confirm as documented on both copies.",
        })),
    ],
    { preparer: "A. Sample", reviewer: "B. Sample", date: "2026-06-01" },
  );
  assert.equal(ok.error, null);
  assert.ok(ok.final.rejectedFlags?.some((f) => f.id === drop.id));
  assert.ok(!ok.final.findings.some((f) => f.id === drop.id));
  assert.equal(ok.final.findings.find((f) => f.id === keep.id)?.disposition, "update");
  assert.equal(ok.final.mode, "MOCK");
});

test("xlsx workpaper has MOCK stamp, preparer/reviewer/date, and a never-deleted rejected-flags tab", () => {
  const { output } = runRecon(generateDemoUniverse(), EMPTY);
  const one = output.findings[0];
  const rest = output.findings.slice(1);
  const finalized = finalizeRcmDraft(
    output,
    [
      {
        finding: one,
        status: "rejected",
        reasonCode: "evidence_insufficient",
      },
      ...rest.map((f) => ({
        finding: f,
        status: "accepted" as const,
        disposition: "retain" as const,
        dispositionRationale: "Keep as-is for the MOCK demo.",
      })),
    ],
    { preparer: "A. Sample", reviewer: "B. Sample", date: "2026-06-01" },
  );
  const meta = {
    preparer: "A. Sample",
    reviewer: "B. Sample",
    date: "2026-06-01",
    mode: "MOCK" as const,
    bankName: "Wrenbridge Community Bank, N.A.",
  };
  const sheets = workpaperSheets(finalized.final, meta);
  assert.ok(sheets.some((s) => s.name === "Rejected flags"));
  const rejected = sheets.find((s) => s.name === "Rejected flags")!;
  assert.ok(rejected.rows.some((r) => r.join(" ").includes("never deleted")));
  assert.ok(rejected.rows.some((r) => r.join(" ").includes(one.title)));
  const flags = sheets.find((s) => s.name === "Flags")!;
  assert.ok(flags.rows[0].join(" ").includes("MOCK"));
  assert.ok(flags.rows.at(-1)?.join(" ").includes("Preparer: A. Sample"));
  assert.ok(flags.rows.at(-1)?.join(" ").includes("Reviewer: B. Sample"));
  const buf = buildWorkpaperXlsx(finalized.final, meta);
  assert.equal(buf.subarray(0, 2).toString(), "PK");
  assert.ok(buf.length > 500);
});

test("RCM flags survive grounding because quotes come from source cells", () => {
  const { output } = runRecon(generateDemoUniverse(), EMPTY);
  const input = {
    engagementName: "t",
    preparer: "p",
    reviewer: "r",
    universeJson: JSON.stringify(generateDemoUniverse()),
  };
  const report = checkGrounding(sku, input, output);
  assert.equal(report.quarantinedIds.length, 0, `quarantined ${report.quarantinedIds.join(",")}`);
});

test("a learned example can suppress an RCM flag (eval gate is not a tautology)", () => {
  const base = sku.mockDraft(
    {
      engagementName: "t",
      preparer: "p",
      reviewer: "r",
      universeJson: "",
    },
    EMPTY,
  );
  const taught: PromptSnapshot = {
    systemPrompt: sku.systemPromptV1,
    fewShots: [
      {
        situation: "Reviewers rejected unmatched_in_copy on personnel termination.",
        lesson: "Do not raise unmatched_in_copy flags for ITGC-PS-01 when SOX scopes HR separately.",
      },
    ],
  };
  const after = sku.mockDraft(
    { engagementName: "t", preparer: "p", reviewer: "r", universeJson: "" },
    taught,
  );
  assert.ok(base.findings.length > after.findings.length);
  assert.ok(base.findings.some((f) => /ITGC-PS-01/.test(f.title)));
  assert.ok(!after.findings.some((f) => /ITGC-PS-01/.test(f.title)));
});
