import { sql } from "drizzle-orm";
import { getDb, schema } from "../src/db/client";
import { DDL } from "../src/db/ddl";
import { allSkus } from "../src/core/sku";
import { and, eq } from "drizzle-orm";

async function main() {
  const db = await getDb();
  for (const stmt of DDL) {
    await db.execute(sql.raw(stmt));
  }
  // Seed prompt version 1 per SKU if absent.
  for (const def of allSkus()) {
    const existing = await db
      .select({ id: schema.promptVersions.id })
      .from(schema.promptVersions)
      .where(
        and(
          eq(schema.promptVersions.tenant, def.tenant),
          eq(schema.promptVersions.sku, def.sku),
        ),
      );
    if (existing.length === 0) {
      await db.insert(schema.promptVersions).values({
        tenant: def.tenant,
        sku: def.sku,
        version: 1,
        status: "active",
        systemPrompt: def.systemPromptV1,
        fewShots: [],
        notes: "v1 seeded from SKU definition",
      });
      console.log(`seeded prompt v1 for ${def.tenant}/${def.sku}`);
    }
  }
  console.log("db ready");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
