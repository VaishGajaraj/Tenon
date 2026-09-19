import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDemoUniverse } from "../src/tenants/rcm/generate";
import { ingestWorkbook, IA_MAP, SOX_MAP } from "../src/tenants/rcm/ingest";
import { identityLadder } from "../src/tenants/rcm/identity";
import { runRecon } from "../src/tenants/rcm/engine";
import { rcmReconSku as sku } from "../src/tenants/rcm/sku";
import {
  buildIndex,
  chunksFromRows,
  indexFactRows,
  retrieve,
  rowPairScore,
  spanHash,
} from "../src/tenants/rcm/retrieve";
import { applyRetrievalToFlags, draftDispositionRationale } from "../src/tenants/rcm/model-share";
import type { PromptSnapshot } from "../src/core/types";

const EMPTY: PromptSnapshot = { systemPrompt: sku.systemPromptV1, fewShots: [] };

test("span hashes are stable and retrieval ranks the BCP pair without auto-matching", () => {
  assert.equal(spanHash(["a", "b"]), spanHash(["a", "b"]));
  assert.notEqual(spanHash(["a", "b"]), spanHash(["a", "c"]));
  const u = generateDemoUniverse();
  const ia = ingestWorkbook(u.ia, IA_MAP);
  const sox = ingestWorkbook(u.sox, SOX_MAP);
  const index = indexFactRows(ia, sox);
  assert.ok(index.chunks.length > 20);
  const iaBcp = ia.find((r) => r.displayId === "ITGC-CP-01")!;
  const soxBcp = sox.find((r) => r.displayId === "SOX-BCP-07")!;
  const hits = retrieve(`${iaBcp.title} ${iaBcp.description}`, index, 8);
  assert.ok(hits.some((h) => h.chunk.displayId === "SOX-BCP-07" || h.chunk.displayId === "ITGC-CP-01"));
  assert.ok(rowPairScore(iaBcp, soxBcp, index) > 0.2);
  const ladder = identityLadder(ia, sox);
  assert.equal(ladder.autoMatchedFuzzy, 0);
});

test("engine retrieval fires on fuzzy rationales and cites chunk ids, not a system-prompt dump", () => {
  const { output, flags } = runRecon(generateDemoUniverse(), EMPTY);
  const mech = output.mechanisms as {
    retrieval: {
      fired: boolean;
      backend: string;
      citedChunkIds: string[];
      fuzzyUsedRetrieval: boolean;
      clientTextInSystemPrompt: boolean;
    };
  };
  assert.equal(mech.retrieval.fired, true);
  assert.equal(mech.retrieval.backend, "hybrid-hash");
  assert.equal(mech.retrieval.fuzzyUsedRetrieval, true);
  assert.equal(mech.retrieval.clientTextInSystemPrompt, false);
  assert.ok(mech.retrieval.citedChunkIds.length >= 1);
  const fuzzy = flags.find((f) => f.predicate === "needs_human_match");
  assert.ok(fuzzy);
  assert.match(fuzzy!.rationale, /#[0-9a-f]{16}/);
  assert.match(fuzzy!.rationale, /never auto-matched/);
  assert.doesNotMatch(sku.systemPromptV1, /<<<BEGIN IA RCM/);
  const user = sku.renderUserMessage({
    engagementName: "t",
    preparer: "p",
    reviewer: "r",
    universeJson: "",
  });
  assert.match(user, /RETRIEVED_CHUNK_IDS/);
  assert.doesNotMatch(user, /"copyName": "IA RCM"/);
});

test("unresolved retrieval evidence quarantines the fuzzy flag", () => {
  const u = generateDemoUniverse();
  const ia = ingestWorkbook(u.ia, IA_MAP);
  const empty = buildIndex(chunksFromRows(ia.slice(0, 0), IA_MAP));
  const dummyFlag = {
    id: "x",
    predicate: "needs_human_match" as const,
    title: "Needs human match",
    rationale: "x",
    quotes: { left: "a", right: "b" },
    locators: [
      { copy: "IA RCM", sheet: "Controls", row: 2, column: "A", quote: "a", resolved: true },
      { copy: "SOX RCM", sheet: "RCM", row: 2, column: "A", quote: "b", resolved: true },
    ] as [
      { copy: string; sheet: string; row: number; column: string; quote: string; resolved: boolean },
      { copy: string; sheet: string; row: number; column: string; quote: string; resolved: boolean },
    ],
    iaDisplayId: "ITGC-CP-01",
    soxDisplayId: "SOX-BCP-07",
    field: "displayId",
    confidence: "medium" as const,
  };
  const result = applyRetrievalToFlags([dummyFlag], empty);
  assert.equal(result.flags.length, 0);
  assert.equal(result.quarantined.length, 1);
  assert.match(draftDispositionRationale(dummyFlag, []), /unresolved/);
});
