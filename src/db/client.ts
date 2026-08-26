/**
 * Dual-driver database client.
 * - DATABASE_URL set  -> real Postgres via postgres-js (production / docker).
 * - DATABASE_URL unset -> embedded PGlite in ./.tenon-data (zero-setup dev).
 * Both are drizzle clients with the same query surface.
 */
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

/**
 * Both drivers expose the same drizzle query surface; we narrow to one concrete
 * type so the whole codebase is type-checked (the previous `any` disabled
 * checking at exactly the layer where mistakes are most expensive).
 */
export type Db = PgliteDatabase<typeof schema>;

async function buildPg(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const postgres = (await import("postgres")).default;
    const sql = postgres(url, { max: 5 });
    return drizzle(sql, { schema }) as unknown as Db;
  }
  const { drizzle } = await import("drizzle-orm/pglite");
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite("./.tenon-data");
  return drizzle(pg, { schema }) as unknown as Db;
}

/**
 * Cache the PROMISE, not the resolved value: concurrent first callers (routine
 * under parallel route rendering) would otherwise each construct a client —
 * two PGlite instances on one data directory is a corruption risk.
 */
let _db: Promise<Db> | null = null;

export function getDb(): Promise<Db> {
  return (_db ??= buildPg());
}

export { schema };
