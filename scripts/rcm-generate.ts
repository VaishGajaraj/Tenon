import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateDemoUniverse } from "../src/tenants/rcm/generate";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "../src/tenants/rcm/fixtures");

async function main() {
  const universe = generateDemoUniverse();
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "universe.json"), JSON.stringify(universe, null, 2));
  writeFileSync(join(outDir, "ground_truth.json"), JSON.stringify(universe.groundTruth, null, 2));
  writeFileSync(join(outDir, "ia-rcm.json"), JSON.stringify(universe.ia, null, 2));
  writeFileSync(join(outDir, "sox-rcm.json"), JSON.stringify(universe.sox, null, 2));
  console.log(`wrote ${universe.ia.rows.length} IA rows, ${universe.sox.rows.length} SOX rows, ${universe.groundTruth.length} ground-truth divergences → ${outDir}`);
}

main();
