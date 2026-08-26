import {
  pgTable,
  text,
  integer,
  boolean,
  doublePrecision,
  timestamp,
  jsonb,
  serial,
} from "drizzle-orm/pg-core";

/**
 * Tenon data model.
 *
 * Design rules (see docs/SPEC.md):
 * - The database is the queue. Work items move through an explicit status
 *   state machine; workers claim rows atomically (UPDATE ... RETURNING).
 * - Prompt versions are immutable. Promotion creates a new row; rollback is
 *   re-activating an old row. A partial unique index enforces one active
 *   version per SKU/step so the invariant is the database's job.
 * - Corrections are structured events, never diffs buried in free text.
 *   Every correction is a candidate eval case, attributed to a reviewer.
 * - `is_mock` separates demo data from real data everywhere it can accumulate:
 *   the correction corpus is the moat, and polluting it is irreversible.
 */

export const workItems = pgTable("work_items", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull().default("default"),
  tenant: text("tenant").notNull(), // which SkuDef, e.g. "mitigation"
  sku: text("sku").notNull(),
  status: text("status").notNull().default("intake"),
  // intake -> drafting -> in_review -> delivered | failed
  title: text("title").notNull(),
  input: jsonb("input").notNull(),
  version: integer("version").notNull().default(0), // optimistic concurrency
  claimedBy: text("claimed_by"),
  claimedExpiresAt: timestamp("claimed_expires_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const runs = pgTable("runs", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull().default("default"),
  itemId: integer("item_id").notNull(),
  promptVersionId: integer("prompt_version_id").notNull(),
  step: text("step").notNull().default("draft"),
  model: text("model").notNull(),
  isMock: boolean("is_mock").notNull().default(false),
  output: jsonb("output").notNull(),
  grounding: jsonb("grounding"), // deterministic grounding report
  usage: jsonb("usage"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const corrections = pgTable("corrections", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull().default("default"),
  itemId: integer("item_id").notNull(),
  runId: integer("run_id").notNull(),
  reviewerId: text("reviewer_id").notNull().default("solo"),
  step: text("step").notNull().default("draft"),
  isMock: boolean("is_mock").notNull().default(false),
  targetPath: text("target_path").notNull(),
  kind: text("kind").notNull(), // edit | reject | add
  reasonCode: text("reason_code").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deliverables = pgTable("deliverables", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull().default("default"),
  itemId: integer("item_id").notNull(),
  runId: integer("run_id"),
  promptVersionId: integer("prompt_version_id"),
  reviewerId: text("reviewer_id").notNull().default("solo"),
  isMock: boolean("is_mock").notNull().default(false),
  final: jsonb("final").notNull(),
  reviewSeconds: integer("review_seconds"),
  correctionCount: integer("correction_count").notNull().default(0),
  findingsTotal: integer("findings_total").notNull().default(0),
  findingsAccepted: integer("findings_accepted").notNull().default(0),
  findingsAdded: integer("findings_added").notNull().default(0),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }).notNull().defaultNow(),
});

export const promptVersions = pgTable("prompt_versions", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull().default("default"),
  tenant: text("tenant").notNull(),
  sku: text("sku").notNull(),
  step: text("step").notNull().default("draft"),
  version: integer("version").notNull(),
  status: text("status").notNull().default("active"), // active | proposed | retired
  systemPrompt: text("system_prompt").notNull(),
  fewShots: jsonb("few_shots").notNull().default([]),
  notes: text("notes"),
  parentId: integer("parent_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evalCases = pgTable("eval_cases", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull().default("default"),
  tenant: text("tenant").notNull(),
  sku: text("sku").notNull(),
  step: text("step").notNull().default("draft"),
  source: text("source").notNull(), // correction | seed | manual
  sourceCorrectionId: integer("source_correction_id"),
  isMock: boolean("is_mock").notNull().default(false),
  /** false when the *current* version already satisfies it — tests nothing. */
  informative: boolean("informative").notNull().default(true),
  /** true = reserved for grading, excluded from the reflection input. */
  holdout: boolean("holdout").notNull().default(false),
  input: jsonb("input").notNull(),
  expectation: jsonb("expectation").notNull(),
  weight: doublePrecision("weight").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evalRuns = pgTable("eval_runs", {
  id: serial("id").primaryKey(),
  promptVersionId: integer("prompt_version_id").notNull(),
  results: jsonb("results").notNull(),
  passRate: doublePrecision("pass_rate").notNull(),
  casesScored: integer("cases_scored").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
