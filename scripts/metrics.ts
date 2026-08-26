import { skuMetrics } from "../src/core/metrics";
import { allSkus } from "../src/core/sku";

async function main() {
  for (const def of allSkus()) {
    const m = await skuMetrics(def.tenant, def.sku);
    console.log(`\n${def.tenant}/${def.sku} (prompt v${m.activePromptVersion ?? "?"})`);
    console.log(`  delivered:            ${m.delivered}`);
    console.log(`  corrections / 100:    ${m.correctionsPer100.toFixed(1)}   <- headline metric, should fall week over week`);
    console.log(`  finding precision:    ${(m.findingPrecision * 100).toFixed(1)}%  <- Gate 3 kill criterion: >= 80%`);
    console.log(`  median review time:   ${m.medianReviewSeconds ?? "-"} s`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
