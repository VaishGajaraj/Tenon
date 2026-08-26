import { test } from "node:test";
import assert from "node:assert/strict";
import {
  expectationFor,
  gradeOutput,
  type Expectation,
} from "../src/learn/loop";
import { mitigationSupplementSku as sku } from "../src/tenants/mitigation/sku";
import { checkGrounding, groundingOverlap } from "../src/core/grounding";
import type { DraftOutput, PromptSnapshot } from "../src/core/types";

const INPUT = {
  claimRef: "TEST-1",
  carrierEstimateText: "LGR dehumidifier, 3 days. Water extraction 480 SF. Anti-microbial.",
  dryingLogText: "Day 1 equipment placed. Day 5 goals met, final verification readings recorded.",
  photosSummary: "Poly containment barrier at stairwell. Moisture meter readings.",
  contractorNotes: "Carrier paid 3 equipment days; we ran 5.",
};
const EMPTY: PromptSnapshot = { systemPrompt: sku.systemPromptV1, fewShots: [] };
const rc = (code: string) => sku.reasonCodes.find((r) => r.code === code);

/**
 * THE test. The offline gate is only meaningful if a prompt version can change
 * the output — otherwise every version scores identically and the loop can
 * never close. This asserts the mechanism, not the wiring.
 */
test("a learned example changes the offline draft (the gate is not a tautology)", () => {
  const base = sku.mockDraft(INPUT, EMPTY);
  const taught: PromptSnapshot = {
    systemPrompt: sku.systemPromptV1,
    fewShots: [
      {
        situation: 'Reviewers filed 1 correction with reason "not_supported_by_docs".',
        lesson: "Do not raise containment findings without a line item in the file.",
      },
    ],
  };
  const after = sku.mockDraft(INPUT, taught);
  assert.ok(base.findings.length > after.findings.length, "the lesson must suppress a finding");
  assert.ok(
    !after.findings.some((f) => /containment/i.test(f.title)),
    "the suppressed finding must be the one the lesson is about",
  );
});

test("a rejection mines a case the un-taught version FAILS and the taught version PASSES", () => {
  const base = sku.mockDraft(INPUT, EMPTY);
  const rejected = base.findings.find((f) => /containment/i.test(f.title))!;
  const exp = expectationFor(rc("not_supported_by_docs"), {
    kind: "reject",
    before: rejected,
    after: null,
  });
  assert.ok(exp, "a rejection must produce an expectation");

  // Un-taught version still emits it -> case fails -> the case is informative.
  assert.equal(gradeOutput(base, exp!).pass, false);

  // Taught version suppresses it -> case passes -> the loop closed.
  const taught = sku.mockDraft(INPUT, {
    systemPrompt: sku.systemPromptV1,
    fewShots: [{ situation: "containment corrections", lesson: "Do not raise containment findings." }],
  });
  assert.equal(gradeOutput(taught, exp!).pass, true);
});

test("wrong_citation mines a citation-specific case, not a vacuous title case", () => {
  const before = {
    id: "f1",
    title: "Dehumidifier days underpaid",
    citation: "IICRC S500 — wrong section",
    rationale: "x",
  };
  const after = { ...before, citation: "IICRC S500 — drying to verified moisture goals" };
  const exp = expectationFor(rc("wrong_citation"), { kind: "edit", before, after })!;
  assert.ok(exp.forbidCitationFor, "must target the stale citation");
  assert.ok(!exp.mustNotInclude, "must not forbid the (correct) title — that would be vacuous");

  const stale: DraftOutput = {
    findings: [
      {
        id: "f1",
        category: "equipment_days",
        title: "Dehumidifier days underpaid (5 logged vs 3 paid)",
        rationale: "x",
        citation: "IICRC S500 — wrong section",
        estimatedValueUsd: null,
        confidence: "high",
      },
    ],
    narrative: "",
    selfCheckNotes: [],
  };
  assert.equal(gradeOutput(stale, exp).pass, false, "stale citation must fail");
  const fixed: DraftOutput = {
    ...stale,
    findings: [{ ...stale.findings[0], citation: "IICRC S500 — drying to verified moisture goals" }],
  };
  assert.equal(gradeOutput(fixed, exp).pass, true, "corrected citation must pass");
});

test("style corrections are not mined (they would be noise in the suite)", () => {
  const exp = expectationFor(rc("style"), {
    kind: "edit",
    before: "old narrative",
    after: "new narrative",
  });
  assert.equal(exp, null);
});

test("grounding: an ungrounded finding is quarantined before a human sees it", () => {
  const output: DraftOutput = {
    findings: [
      {
        id: "f1",
        category: "equipment_days",
        title: "Dehumidifier days underpaid",
        rationale: "Drying log records equipment through day 5; estimate pays 3 days dehumidifier.",
        citation: "IICRC S500",
        estimatedValueUsd: null,
        confidence: "high",
      },
      {
        id: "f2",
        category: "code_upgrade",
        title: "Asbestos abatement supervision",
        rationale:
          "Hazardous asbestos abatement supervisory oversight requires licensed industrial hygienist monitoring throughout remediation.",
        citation: "EPA NESHAP",
        estimatedValueUsd: null,
        confidence: "medium",
      },
    ],
    narrative: "",
    selfCheckNotes: [],
  };
  const report = checkGrounding(sku, INPUT, output);
  assert.ok(report.quarantinedIds.includes("f2"), "the invented finding must be quarantined");
  assert.ok(!report.quarantinedIds.includes("f1"), "the grounded finding must survive");
  assert.equal(report.kept.length, 1);
});

test("grounding overlap is 1 when every term appears in the source", () => {
  assert.equal(groundingOverlap("dehumidifier days", "the dehumidifier ran five days"), 1);
});

test("an expectation with no discriminative content is never created", () => {
  const exp = expectationFor(rc("missed_by_ai"), {
    kind: "add",
    before: null,
    after: { title: "a b", rationale: "" }, // no long terms
  });
  assert.equal(exp, null);
});

test("reason-code weights and lessons live on the SKU, not in the learning loop (ADR-3)", () => {
  for (const r of sku.reasonCodes) {
    assert.equal(typeof r.weight, "number");
    assert.ok(r.mockLesson.length > 0, `${r.code} needs a lesson`);
    assert.ok(["forbid_title", "require_terms", "forbid_citation", "none"].includes(r.expectation));
  }
  const loop = require("node:fs").readFileSync(
    new URL("../src/learn/loop.ts", import.meta.url),
    "utf8",
  );
  assert.ok(!/drying log/i.test(loop), "core must not contain tenant domain language");
  assert.ok(!/"style"/.test(loop), "core must not hardcode a tenant reason code");
});
