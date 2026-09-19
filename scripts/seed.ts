import { getDb, schema } from "../src/db/client";
import { generateDemoUniverse } from "../src/tenants/rcm/generate";

/**
 * Seeds the MOCK RCM recon engagement (Wrenbridge IA vs SOX). Mitigation
 * claims remain available via `pnpm seed:mitigation` — that SKU is legacy
 * scaffold and is not the demo path.
 */
async function main() {
  const db = await getDb();
  const existing = await db.select({ id: schema.workItems.id, tenant: schema.workItems.tenant }).from(schema.workItems);
  if (existing.some((r) => r.tenant === "rcm")) {
    console.log(`seed skipped — RCM work item already present`);
    process.exit(0);
  }
  const universe = generateDemoUniverse();
  await db.insert(schema.workItems).values({
    tenant: "rcm",
    sku: "recon",
    status: "intake",
    title: "Wrenbridge Community Bank — IA RCM vs SOX RCM (MOCK)",
    input: {
      engagementName: "Wrenbridge Community Bank — IA vs SOX RCM reconciliation",
      preparer: "A. Sample, Internal Audit",
      reviewer: "B. Sample, SOX PMO",
      bankName: universe.bankName,
      asOf: universe.asOf,
      universeJson: JSON.stringify(universe),
      iaRowCount: universe.ia.rows.length,
      soxRowCount: universe.sox.rows.length,
      ingestSource: "seed",
    },
  });
  console.log("seeded MOCK RCM recon (IA RCM vs SOX RCM). Run: pnpm worker");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
