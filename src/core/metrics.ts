import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

export interface SkuMetrics {
  tenant: string;
  sku: string;
  delivered: number;
  correctionsPer100: number; // headline metric
  findingPrecision: number; // accepted findings / drafted findings
  medianReviewSeconds: number | null;
  activePromptVersion: number | null;
}

export async function skuMetrics(tenant: string, sku: string): Promise<SkuMetrics> {
  const db = await getDb();
  const rows: {
    correctionCount: number;
    findingsTotal: number;
    findingsAccepted: number;
    reviewSeconds: number | null;
  }[] = await db
    .select({
      correctionCount: schema.deliverables.correctionCount,
      findingsTotal: schema.deliverables.findingsTotal,
      findingsAccepted: schema.deliverables.findingsAccepted,
      reviewSeconds: schema.deliverables.reviewSeconds,
    })
    .from(schema.deliverables)
    .innerJoin(schema.workItems, eq(schema.deliverables.itemId, schema.workItems.id))
    .where(and(eq(schema.workItems.tenant, tenant), eq(schema.workItems.sku, sku)));

  const delivered = rows.length;
  const corrections = rows.reduce((a, r) => a + r.correctionCount, 0);
  const totalFindings = rows.reduce((a, r) => a + r.findingsTotal, 0);
  const accepted = rows.reduce((a, r) => a + r.findingsAccepted, 0);
  const times = rows
    .map((r) => r.reviewSeconds)
    .filter((t): t is number => typeof t === "number")
    .sort((a, b) => a - b);

  const pvRows = await db
    .select({ version: schema.promptVersions.version })
    .from(schema.promptVersions)
    .where(
      and(
        eq(schema.promptVersions.tenant, tenant),
        eq(schema.promptVersions.sku, sku),
        eq(schema.promptVersions.status, "active"),
      ),
    );

  return {
    tenant,
    sku,
    delivered,
    correctionsPer100: delivered === 0 ? 0 : (corrections / delivered) * 100,
    findingPrecision: totalFindings === 0 ? 1 : accepted / totalFindings,
    medianReviewSeconds: times.length ? times[Math.floor(times.length / 2)] : null,
    activePromptVersion: pvRows[0]?.version ?? null,
  };
}
