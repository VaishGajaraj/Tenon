import { skuMetrics, metricsByPromptVersion } from "../src/core/metrics";
import { allSkus } from "../src/core/sku";

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
const num = (v: number | null, d = 1) => (v === null ? "—" : v.toFixed(d));

async function main() {
  for (const def of allSkus()) {
    const all = await skuMetrics(def.tenant, def.sku);
    const win = await skuMetrics(def.tenant, def.sku, { windowDays: 30 });
    console.log(`\n${def.tenant}/${def.sku} (prompt v${all.activePromptVersion ?? "?"})`);
    console.log(`  delivered (all time / 30d):  ${all.delivered} / ${win.delivered}`);
    console.log(`  corrections per 100:         ${num(win.correctionsPer100)}   <- headline, should FALL`);
    console.log(`  finding precision:           ${pct(win.findingPrecision)}  <- kill line: 80%`);
    console.log(`  findings per deliverable:    ${num(win.findingsPerDeliverable)}   <- counterweight, must NOT fall`);
    console.log(`  reviewer-added misses/deliv: ${num(win.missesPerDeliverable, 2)}   <- recall signal`);
    console.log(`  median review time:          ${win.medianReviewSeconds ?? "—"} s`);

    const byVersion = await metricsByPromptVersion(def.tenant, def.sku);
    if (byVersion.length) {
      console.log("  by prompt version:");
      for (const v of byVersion) {
        console.log(
          `    v${v.version}: ${v.delivered} delivered, ${v.correctionsPer100.toFixed(1)} corr/100, ${(v.precision * 100).toFixed(1)}% precision`,
        );
      }
    }
  }
  console.log(
    "\nA falling correction rate with falling findings/deliverable is a quieter model, not a better one.\n",
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
