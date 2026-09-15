import { getDb, schema } from "../src/db/client";

/**
 * Legacy mitigation seed. Kept so the original scaffold still exercises
 * itself; it is not the act-one demo path.
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
];

async function main() {
  const db = await getDb();
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
  console.log(`seeded ${CLAIMS.length} synthetic claims (legacy mitigation). Run: pnpm worker`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
