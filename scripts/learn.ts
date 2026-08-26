import {
  mineCorrections,
  proposeNewVersion,
  promoteIfBetter,
} from "../src/learn/loop";

const TENANT = process.env.TENON_TENANT || "mitigation";
const SKU = process.env.TENON_SKU || "supplement-review";
const PROMOTE = process.argv.includes("--promote");

async function main() {
  console.log(`learning loop for ${TENANT}/${SKU}`);
  const mined = await mineCorrections(TENANT, SKU);
  console.log(`1. mined ${mined} new eval case(s) from corrections`);

  const proposedId = await proposeNewVersion(TENANT, SKU);
  if (!proposedId) {
    console.log("2. no corrections yet — nothing to learn from");
    process.exit(0);
  }
  console.log(`2. proposed prompt version id=${proposedId}`);

  if (PROMOTE) {
    const res = await promoteIfBetter(TENANT, SKU, proposedId);
    console.log(
      `3. eval gate — proposed ${(res.proposed * 100).toFixed(1)}% vs active ${(res.active * 100).toFixed(1)}% → ${res.promoted ? "PROMOTED" : "kept active version"}`,
    );
  } else {
    console.log("3. proposal stored with status=proposed. Re-run with --promote to eval-gate and promote.");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
