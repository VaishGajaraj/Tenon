import { getDb, schema } from "../src/db/client";

/**
 * Seeds a small batch of synthetic water-loss claims. A batch (not one item) so
 * the learning loop has enough corrections to produce a held-out suite large
 * enough for the gate to be allowed to promote — demonstrating the guard rather
 * than tiptoeing around it.
 */

const BASE_ESTIMATE = (days: number, sf: number) => `WATER MITIGATION ESTIMATE (CARRIER)
1. Water extraction, category 2 — ${sf} SF
2. LGR dehumidifier, ${days} days
3. Air mover, 4 units x ${days} days
4. Tear out wet drywall, 2' flood cut
5. Anti-microbial application, ${sf} SF`;

const BASE_LOG = (days: number) => `DRYING LOG
Day 1: 4 air movers + 1 LGR dehu placed. Moisture readings taken.
${Array.from({ length: days - 2 }, (_, i) => `Day ${i + 2}: readings falling. Equipment running.`).join("\n")}
Day ${days}: drying goals met, equipment pulled, final verification readings recorded.`;

const CLAIMS = [
  { ref: "44-8871-D", addr: "12 Maple St", paid: 3, ran: 5, sf: 480 },
  { ref: "44-9102-A", addr: "88 Ridge Ave", paid: 3, ran: 6, sf: 620 },
  { ref: "45-1120-B", addr: "7 Cedar Ct", paid: 2, ran: 5, sf: 310 },
  { ref: "45-2277-C", addr: "230 Elm Blvd", paid: 4, ran: 6, sf: 900 },
  { ref: "45-3390-E", addr: "19 Birch Ln", paid: 3, ran: 5, sf: 400 },
  { ref: "45-4418-F", addr: "64 Walnut Way", paid: 2, ran: 5, sf: 275 },
  { ref: "45-5501-G", addr: "3 Spruce Ter", paid: 3, ran: 6, sf: 540 },
  { ref: "45-6644-H", addr: "150 Oak Dr", paid: 4, ran: 5, sf: 720 },
  { ref: "45-7788-J", addr: "22 Pine Hollow", paid: 3, ran: 5, sf: 360 },
];

async function main() {
  const db = await getDb();
  const existing = await db.select({ id: schema.workItems.id }).from(schema.workItems);
  if (existing.length > 0) {
    console.log(`seed skipped — ${existing.length} work item(s) already present`);
    process.exit(0);
  }
  for (const c of CLAIMS) {
    await db.insert(schema.workItems).values({
      tenant: "mitigation",
      sku: "supplement-review",
      status: "intake",
      title: `Claim ${c.ref} — ${c.addr} water loss`,
      input: {
        claimRef: c.ref,
        carrierEstimateText: BASE_ESTIMATE(c.paid, c.sf),
        dryingLogText: BASE_LOG(c.ran),
        photosSummary:
          "Photos show poly containment barrier at stairwell, PPE in use, dehumidifier and air movers placed, moisture meter readings on drywall and sill plate.",
        contractorNotes: `Carrier paid ${c.paid} equipment days; we ran ${c.ran} to hit drying goals per the log. Containment set up day 1. Final moisture verification visit is not on their estimate.`,
      },
    });
  }
  console.log(`seeded ${CLAIMS.length} synthetic claims. Run: pnpm worker`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
