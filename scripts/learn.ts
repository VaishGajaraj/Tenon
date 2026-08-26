import { mineCorrections, proposePerCluster, promoteBest } from "../src/learn/loop";

const TENANT = process.env.TENON_TENANT || "mitigation";
const SKU = process.env.TENON_SKU || "supplement-review";
const PROMOTE = process.argv.includes("--promote");

async function main() {
  console.log(`learning loop for ${TENANT}/${SKU}`);
  const { created, informative } = await mineCorrections(TENANT, SKU);
  console.log(
    `1. mined ${created} new eval case(s) — ${informative} informative (the rest already pass, so they test nothing)`,
  );

  const opened = await proposePerCluster(TENANT, SKU);
  if (opened.length === 0) {
    console.log("2. no new proposals (nothing trainable, or every candidate change has already been tried)");
    process.exit(0);
  }
  console.log(
    `2. opened ${opened.length} branch(es): ${opened.map((o) => `${o.branch}#${o.id}`).join(", ")}`,
  );

  if (!PROMOTE) {
    console.log("3. branches stored as `proposed`. Re-run with --promote to gate them.");
    process.exit(0);
  }

  const res = await promoteBest(TENANT, SKU);
  console.log(`3. gate on ${res.total} held-out case(s) — active ${(res.active * 100).toFixed(1)}%`);
  for (const b of res.branches) {
    console.log(
      `     ${b.promoted ? "→" : " "} ${b.branch.padEnd(28)} v${b.version}  ${(b.passRate * 100).toFixed(1)}%${b.promoted ? "  PROMOTED" : ""}`,
    );
  }
  if (!res.promoted) console.log(`   kept active version (${res.reason})`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
