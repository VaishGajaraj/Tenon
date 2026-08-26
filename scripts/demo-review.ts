// Simulate a reviewer session: reject one finding, deliver, so learn has signal.
import { getDb, schema } from "../src/db/client";
import { eq } from "drizzle-orm";
async function main() {
  const db = await getDb();
  const [run] = await db.select().from(schema.runs).limit(1);
  if (!run) throw new Error("no run");
  const out: any = run.output;
  const rejected = out.findings[1];
  await db.insert(schema.corrections).values({
    itemId: run.itemId, runId: run.id, targetPath: "findings[1]", kind: "reject",
    reasonCode: "not_supported_by_docs", before: rejected, after: null,
    note: "containment visible in photos but photos not attached to this claim file",
  });
  await db.insert(schema.deliverables).values({
    itemId: run.itemId, final: { ...out, findings: out.findings.filter((_: any, i: number) => i !== 1) },
    reviewSeconds: 420, correctionCount: 1, findingsTotal: out.findings.length, findingsAccepted: out.findings.length - 1,
  });
  await db.update(schema.workItems).set({ status: "delivered" }).where(eq(schema.workItems.id, run.itemId));
  console.log("simulated review: 1 rejection, delivered");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
