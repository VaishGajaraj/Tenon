/**
 * Dual-driver database client.
 * - DATABASE_URL set  -> real Postgres via postgres-js (production / docker).
 * - DATABASE_URL unset -> embedded PGlite in ./.tenon-data (zero-setup dev).
 * Both are drizzle clients with the same query surface.
 */
import * as schema from "./schema";

export type Db = ReturnType<typeof buildPg> extends Promise<infer T> ? T : never;

let _db: any = null;

async function buildPg() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const postgres = (await import("postgres")).default;
    const sql = postgres(url, { max: 5 });
    return drizzle(sql, { schema });
  }
  const { drizzle } = await import("drizzle-orm/pglite");
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite("./.tenon-data");
  return drizzle(pg, { schema });
}

export async function getDb() {
  if (!_db) _db = await buildPg();
  return _db;
}

export { schema };
