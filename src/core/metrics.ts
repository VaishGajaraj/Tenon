import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

/**
 * Metrics.
 *
 * Deliberate design point: "corrections per 100" alone is gamed by silence —
 * a model that emits one trivially-defensible finding per claim scores
 * perfectly on corrections AND precision while destroying the product's value.
 * So the counterweights (findings per deliverable, reviewer-added misses) are
 * first-class, not optional, and every metric is reported over a window so the
 * trend can actually move.
 */

export interface SkuMetrics {
  tenant: string;
  sku: string;
  windowDays: number | null;
  delivered: number;
  correctionsPer100: number | null; // headline — should fall
  findingPrecision: number | null; // Gate-3 kill line: >= 0.80
  findingsPerDeliverable: number | null; // counterweight — must NOT fall
  missesPerDeliverable: number | null; // counterweight — reviewer-added findings
  medianReviewSeconds: number | null;
  activePromptVersion: number | null;
}

interface Row {
  correctionCount: number;
  findingsTotal: number;
  findingsAccepted: number;
  findingsAdded: number;
  reviewSeconds: number | null;
}

export async function skuMetrics(
  tenant: string,
  sku: string,
  opts: { windowDays?: number | null; includeMock?: boolean } = {},
): Promise<SkuMetrics> {
  const db = await getDb();
  const windowDays = opts.windowDays ?? null;
  const includeMock = opts.includeMock ?? true;

  const filters = [eq(schema.workItems.tenant, tenant), eq(schema.workItems.sku, sku)];
  if (!includeMock) filters.push(eq(schema.deliverables.isMock, false));
  if (windowDays) {
    filters.push(sql`${schema.deliverables.deliveredAt} > now() - (${windowDays} * interval '1 day')`);
  }

  const rows: Row[] = await db
    .select({
      correctionCount: schema.deliverables.correctionCount,
      findingsTotal: schema.deliverables.findingsTotal,
      findingsAccepted: schema.deliverables.findingsAccepted,
      findingsAdded: schema.deliverables.findingsAdded,
      reviewSeconds: schema.deliverables.reviewSeconds,
    })
    .from(schema.deliverables)
    .innerJoin(schema.workItems, eq(schema.deliverables.itemId, schema.workItems.id))
    .where(and(...filters));

  const delivered = rows.length;
  const corrections = rows.reduce((a, r) => a + r.correctionCount, 0);
  const totalFindings = rows.reduce((a, r) => a + r.findingsTotal, 0);
  const accepted = rows.reduce((a, r) => a + r.findingsAccepted, 0);
  const added = rows.reduce((a, r) => a + r.findingsAdded, 0);
  const times = rows
    .map((r) => r.reviewSeconds)
    .filter((t): t is number => typeof t === "number")
    .sort((a, b) => a - b);

  const pvRows: { version: number }[] = await db
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
    windowDays,
    delivered,
    correctionsPer100: delivered === 0 ? null : (corrections / delivered) * 100,
    findingPrecision: totalFindings === 0 ? null : accepted / totalFindings,
    findingsPerDeliverable: delivered === 0 ? null : totalFindings / delivered,
    missesPerDeliverable: delivered === 0 ? null : added / delivered,
    medianReviewSeconds: times.length ? times[Math.floor(times.length / 2)] : null,
    activePromptVersion: pvRows[0]?.version ?? null,
  };
}

/** Same metrics sliced by the prompt version that produced the draft. */
export async function metricsByPromptVersion(
  tenant: string,
  sku: string,
): Promise<{ version: number; delivered: number; correctionsPer100: number; precision: number }[]> {
  const db = await getDb();
  const rows: (Row & { version: number })[] = await db
    .select({
      version: schema.promptVersions.version,
      correctionCount: schema.deliverables.correctionCount,
      findingsTotal: schema.deliverables.findingsTotal,
      findingsAccepted: schema.deliverables.findingsAccepted,
      findingsAdded: schema.deliverables.findingsAdded,
      reviewSeconds: schema.deliverables.reviewSeconds,
    })
    .from(schema.deliverables)
    .innerJoin(schema.workItems, eq(schema.deliverables.itemId, schema.workItems.id))
    .innerJoin(
      schema.promptVersions,
      eq(schema.deliverables.promptVersionId, schema.promptVersions.id),
    )
    .where(and(eq(schema.workItems.tenant, tenant), eq(schema.workItems.sku, sku)));

  const byVersion = new Map<number, Row[]>();
  for (const r of rows) {
    if (!byVersion.has(r.version)) byVersion.set(r.version, []);
    byVersion.get(r.version)!.push(r);
  }
  return [...byVersion.entries()]
    .map(([version, rs]) => {
      const total = rs.reduce((a, r) => a + r.findingsTotal, 0);
      return {
        version,
        delivered: rs.length,
        correctionsPer100: (rs.reduce((a, r) => a + r.correctionCount, 0) / rs.length) * 100,
        precision: total === 0 ? 1 : rs.reduce((a, r) => a + r.findingsAccepted, 0) / total,
      };
    })
    .sort((a, b) => a.version - b.version);
}
