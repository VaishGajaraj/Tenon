import { test } from "node:test";
import assert from "node:assert/strict";
import { generateDemoUniverse } from "../src/tenants/rcm/generate";
import {
  AUDITBOARDISH_MAP,
  detectColumnMap,
  GENERIC_RCM_MAP,
  ingestWorkbookDetailed,
  IA_MAP,
  SOX_MAP,
} from "../src/tenants/rcm/ingest";
import { universeFromDroppedFiles } from "../src/tenants/rcm/drop";
import { parseCsv, parseSpreadsheet, toCsv, workbookToXlsx } from "../src/tenants/rcm/spreadsheet";
import { CANONICAL_CONTROLS, BANK_GRADE_CONTROLS } from "../src/tenants/rcm/library";
import { BANK_GRADE_CONTROLS as BANK_FROM_MODULE } from "../src/tenants/rcm/library-bank";
import { DEMO_BANK } from "../src/tenants/rcm/schema";
import { runRecon } from "../src/tenants/rcm/engine";
import { rcmReconSku as sku } from "../src/tenants/rcm/sku";
import type { PromptSnapshot } from "../src/core/types";
import type { RawWorkbook } from "../src/tenants/rcm/schema";

const EMPTY: PromptSnapshot = { systemPrompt: sku.systemPromptV1, fewShots: [] };

function remapSoxAuditboard(book: RawWorkbook): RawWorkbook {
  const headers = Object.values(AUDITBOARDISH_MAP);
  const rows = book.rows.map((r) => ({
    [AUDITBOARDISH_MAP.recordId]: r[SOX_MAP.recordId] ?? "",
    [AUDITBOARDISH_MAP.displayId]: r[SOX_MAP.displayId] ?? "",
    [AUDITBOARDISH_MAP.crosswalkId]: r[SOX_MAP.crosswalkId] ?? "",
    [AUDITBOARDISH_MAP.title]: r[SOX_MAP.title] ?? "",
    [AUDITBOARDISH_MAP.description]: r[SOX_MAP.description] ?? "",
    [AUDITBOARDISH_MAP.owner]: r[SOX_MAP.owner] ?? "",
    [AUDITBOARDISH_MAP.frequency]: r[SOX_MAP.frequency] ?? "",
    [AUDITBOARDISH_MAP.riskIds]: r[SOX_MAP.riskIds] ?? "",
    [AUDITBOARDISH_MAP.status]: r[SOX_MAP.status] ?? "",
    [AUDITBOARDISH_MAP.tested]: r[SOX_MAP.tested] ?? "",
    [AUDITBOARDISH_MAP.lastReviewedOn]: r[SOX_MAP.lastReviewedOn] ?? "",
    [AUDITBOARDISH_MAP.sourceModifiedOn]: r[SOX_MAP.sourceModifiedOn] ?? "",
    [AUDITBOARDISH_MAP.issueId]: r[SOX_MAP.issueId] ?? "",
    [AUDITBOARDISH_MAP.issueStatus]: r[SOX_MAP.issueStatus] ?? "",
  }));
  return { copyName: book.copyName, sheet: book.sheet, headers, rows };
}

test("canonical library looks like a mid-size bank RCM and stays fictional", () => {
  assert.ok(CANONICAL_CONTROLS.length >= 50, `library size ${CANONICAL_CONTROLS.length}`);
  assert.equal(BANK_GRADE_CONTROLS.length, BANK_FROM_MODULE.length);
  const ids = CANONICAL_CONTROLS.map((c) => c.displayId);
  assert.equal(new Set(ids).size, ids.length, "display ids must be unique");
  const catalogs = new Set(CANONICAL_CONTROLS.map((c) => c.catalog));
  for (const need of ["NIST 800-53", "FISCAM ITGC", "FDIC RMS", "OCC", "Part 363", "FFIEC", "COSO ICFR"]) {
    assert.ok(catalogs.has(need as (typeof CANONICAL_CONTROLS)[number]["catalog"]), `missing catalog ${need}`);
  }
  const blob = CANONICAL_CONTROLS.map((c) => `${c.displayId} ${c.title}`).join("\n");
  assert.match(blob, /BSA-CIP-01/);
  assert.match(blob, /SOX-363-01/);
  assert.match(blob, /WIRE-01/);
  assert.match(blob, /ITGC-AT-01/);
  assert.equal(DEMO_BANK.fictional, true);
  assert.equal(DEMO_BANK.bankfindCheck.hits, 0);
  assert.equal(DEMO_BANK.bankfindCheck.asOf, "2026-09-18");
  assert.doesNotMatch(blob, /Bank of America|JPMorgan|Wells Fargo|Capital One/i);
});

test("xlsx and csv round-trip the seed workbooks", () => {
  const u = generateDemoUniverse();
  const xlsx = workbookToXlsx(u.ia);
  const parsed = parseSpreadsheet("ia.xlsx", xlsx);
  assert.deepEqual(parsed.headers, u.ia.headers);
  assert.equal(parsed.rows.length, u.ia.rows.length);
  assert.equal(parsed.rows[0][IA_MAP.displayId], u.ia.rows[0][IA_MAP.displayId]);
  const csv = toCsv(u.sox.headers, u.sox.rows);
  const csvParsed = parseCsv(csv);
  assert.equal(csvParsed.rows.length, u.sox.rows.length);
  assert.equal(csvParsed.rows[0][SOX_MAP.displayId], u.sox.rows[0][SOX_MAP.displayId]);
});

test("file-drop ingest maps generic and AuditBoard-ish presets and quarantines bad rows", () => {
  const u = generateDemoUniverse();
  const iaCsv = toCsv(u.ia.headers, [
    ...u.ia.rows,
    { [IA_MAP.title]: "Orphan title with no id", [IA_MAP.description]: "should quarantine" },
    { [IA_MAP.description]: "no identity columns at all" },
  ]);
  const soxAb = remapSoxAuditboard(u.sox);
  const soxCsv = toCsv(soxAb.headers, soxAb.rows);
  const rcsaCsv = toCsv(u.ia.headers, u.ia.rows.slice(0, 5));
  const dropped = universeFromDroppedFiles({
    ia: { filename: "ia.csv", bytes: iaCsv },
    sox: { filename: "sox-ab.csv", bytes: soxCsv },
    rcsa: { filename: "rcsa.csv", bytes: rcsaCsv },
    preset: "auto",
  });
  assert.equal(dropped.dataMode, "MOCK");
  assert.equal(dropped.ingestReport?.source, "file-drop");
  assert.match(dropped.ingestReport?.maps.ia ?? "", /ia|generic/);
  assert.match(dropped.ingestReport?.maps.sox ?? "", /auditboardish/);
  assert.ok((dropped.ingestReport?.quarantined.length ?? 0) >= 2, "empty + missing id quarantined");
  assert.ok(dropped.rcsa);
  assert.equal(dropped.ia.copyName, "IA RCM");
  assert.equal(dropped.sox.copyName, "SOX RCM");
  const iaIngest = ingestWorkbookDetailed(dropped.ia, detectColumnMap(dropped.ia.headers).map);
  assert.ok(iaIngest.quarantined.length >= 2);
  assert.equal(iaIngest.rows.length, u.ia.rows.length);
  const soxIngest = ingestWorkbookDetailed(dropped.sox, AUDITBOARDISH_MAP);
  assert.equal(soxIngest.rows.length, u.sox.rows.length);
  const { output } = runRecon(dropped, EMPTY);
  const mech = output.mechanisms as {
    fileDropIngest: boolean;
    optionalThirdCopy: boolean;
    quarantinedBadRows: number;
    namedCopies: string[];
  };
  assert.equal(mech.fileDropIngest, true);
  assert.equal(mech.optionalThirdCopy, true);
  assert.ok(mech.quarantinedBadRows >= 2);
  assert.ok(mech.namedCopies.includes("RCSA"));
});

test("detectColumnMap prefers Wrenbridge SOX headers over generic", () => {
  const u = generateDemoUniverse();
  assert.equal(detectColumnMap(u.ia.headers).name, "ia");
  assert.equal(detectColumnMap(u.sox.headers).name, "sox");
  assert.equal(detectColumnMap(Object.values(GENERIC_RCM_MAP)).name, "ia");
  assert.equal(detectColumnMap(Object.values(AUDITBOARDISH_MAP)).name, "auditboardish");
});

test("xlsx drop of the seed copies still fires the manufactured predicates", () => {
  const u = generateDemoUniverse();
  const dropped = universeFromDroppedFiles({
    ia: { filename: "ia.xlsx", bytes: workbookToXlsx(u.ia) },
    sox: { filename: "sox.xlsx", bytes: workbookToXlsx(u.sox) },
  });
  dropped.directory = u.directory;
  dropped.risks = u.risks;
  dropped.issues = u.issues;
  dropped.triggers = u.triggers;
  dropped.groundTruth = u.groundTruth;
  dropped.priorSox = u.priorSox;
  const { flags, quarantined } = runRecon(dropped, EMPTY);
  assert.equal(quarantined.length, 0);
  const fired = new Set(flags.map((f) => f.predicate));
  for (const need of ["unmatched_in_copy", "description_divergence", "attribute_mismatch", "needs_human_match"]) {
    assert.ok(fired.has(need as (typeof flags)[number]["predicate"]), need);
  }
});
