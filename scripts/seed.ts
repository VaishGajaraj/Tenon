import { getDb, schema } from "../src/db/client";

const CARRIER_ESTIMATE = `CLAIM 44-8871-D — WATER MITIGATION ESTIMATE (CARRIER)
1. Water extraction, category 2 — 480 SF ............ $312.00
2. LGR dehumidifier, 3 days @ $95/day ............... $285.00
3. Air mover, 4 units x 3 days @ $32/day ............ $384.00
4. Tear out wet drywall, 2' flood cut, 36 LF ........ $410.00
5. Anti-microbial application, 480 SF ............... $148.00
TOTAL ............................................... $1,539.00`;

const DRYING_LOG = `DRYING LOG — 12 Maple St, basement
Day 1: 4 air movers + 1 LGR dehu placed. Moisture: drywall 98pts, sill 32%.
Day 2: readings drywall 71pts, sill 27%. Equipment running.
Day 3: readings drywall 44pts, sill 22%. Equipment running.
Day 4: readings drywall 27pts, sill 18%. Equipment running.
Day 5: readings drywall 12pts (goal met), sill 14% (goal met). Equipment pulled day 5. Final verification readings recorded.`;

const PHOTOS = `Photos show: poly containment barrier at stairwell with zipper door; PPE in use during tear-out; dehumidifier and 4 air movers placed; moisture meter readings on drywall and sill plate; completed flood cut.`;

const NOTES = `Carrier paid 3 equipment days; we ran 5 to hit drying goals per the log. Containment was set up day 1 (photo 3). We did a final moisture verification visit on day 5 that isn't on their estimate.`;

async function main() {
  const db = await getDb();
  const existing = await db.select({ id: schema.workItems.id }).from(schema.workItems);
  if (existing.length > 0) {
    console.log(`seed skipped — ${existing.length} work item(s) already present`);
    process.exit(0);
  }
  await db.insert(schema.workItems).values({
    tenant: "mitigation",
    sku: "supplement-review",
    status: "intake",
    title: "Claim 44-8871-D — 12 Maple St water loss",
    input: {
      claimRef: "44-8871-D",
      carrierEstimateText: CARRIER_ESTIMATE,
      dryingLogText: DRYING_LOG,
      photosSummary: PHOTOS,
      contractorNotes: NOTES,
    },
  });
  console.log("seeded 1 synthetic claim (Claim 44-8871-D). Run: pnpm worker");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
