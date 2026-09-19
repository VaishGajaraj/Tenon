import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateDemoUniverse } from "../src/tenants/rcm/generate";
import { toCsv, workbookToXlsx } from "../src/tenants/rcm/spreadsheet";
import { AUDITBOARDISH_MAP, SOX_MAP } from "../src/tenants/rcm/ingest";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "../src/tenants/rcm/fixtures");

async function main() {
  const universe = generateDemoUniverse();
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "universe.json"), JSON.stringify(universe, null, 2));
  writeFileSync(join(outDir, "ground_truth.json"), JSON.stringify(universe.groundTruth, null, 2));
  writeFileSync(join(outDir, "ia-rcm.json"), JSON.stringify(universe.ia, null, 2));
  writeFileSync(join(outDir, "sox-rcm.json"), JSON.stringify(universe.sox, null, 2));
  writeFileSync(join(outDir, "ia-rcm.csv"), toCsv(universe.ia.headers, universe.ia.rows));
  writeFileSync(join(outDir, "sox-rcm.csv"), toCsv(universe.sox.headers, universe.sox.rows));
  const abHeaders = Object.values(AUDITBOARDISH_MAP);
  const abRows = universe.sox.rows.map((r) => ({
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
  writeFileSync(join(outDir, "sox-rcm-auditboardish.csv"), toCsv(abHeaders, abRows));
  writeFileSync(join(outDir, "ia-rcm.xlsx"), workbookToXlsx(universe.ia));
  writeFileSync(join(outDir, "sox-rcm.xlsx"), workbookToXlsx(universe.sox));
  console.log(
    `wrote ${universe.ia.rows.length} IA rows, ${universe.sox.rows.length} SOX rows, ${universe.groundTruth.length} ground-truth divergences → ${outDir}`,
  );
}

main();
