import { mineCorrections, proposeNewVersion, promoteIfBetter } from "../src/learn/loop";

const TENANT = process.env.TENON_TENANT || "mitigation";
const SKU = process.env.TENON_SKU || "supplement-review";
const PROMOTE = process.argv.includes("--promote");

async function main() {
  console.log(`learning loop for ${TENANT}/${SKU}`);
  const { created, informative } = await mineCorrections(TENANT, SKU);
  console.log(
    `1. mined ${created} new eval case(s) — ${informative} informative (the rest already pass, so they test nothing)`,
  );

  const proposedId = await proposeNewVersion(TENANT, SKU);
  if (!proposedId) {
    console.log("2. nothing new to learn from (no trainable corrections outside the holdout)");
    process.exit(0);
  }
  console.log(`2. proposed prompt version id=${proposedId}`);

  if (!PROMOTE) {
    console.log("3. stored as `proposed`. Re-run with --promote to eval-gate it.");
    process.exit(0);
  }

  const res = await promoteIfBetter(TENANT, SKU, proposedId);
  console.log(
    `3. gate on ${res.total} held-out case(s) — proposed ${(res.proposed * 100).toFixed(1)}% vs active ${(res.active * 100).toFixed(1)}% → ${
      res.promoted ? "PROMOTED" : `kept active (${res.reason})`
    }`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
