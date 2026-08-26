import {
  pgTable,
  text,
  integer,
  real,
  timestamp,
  jsonb,
  serial,
} from "drizzle-orm/pg-core";

/**
 * Tenon data model.
 *
 * Design rules (see docs/SPEC.md):
 * - The database is the queue. Work items move through an explicit status
 *   state machine; workers claim rows idempotently. No external orchestrator.
 * - Prompt versions are immutable. Promotion creates a new row; rollback is
 *   re-activating an old row. (Sierra pattern: atomic snapshots.)
 * - Corrections are structured events, never diffs buried in free text.
 *   Every correction is a future eval case.
 */

export const workItems = pgTable("work_items", {
  id: serial("id").primaryKey(),
  tenant: text("tenant").notNull(), // e.g. "mitigation"
  sku: text("sku").notNull(), // e.g. "supplement-review"
  status: text("status").notNull().default("intake"),
  // intake -> drafting -> in_review -> approved -> delivered | failed
  title: text("title").notNull(),
  input: jsonb("input").notNull(), // validated against the SKU input schema
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const runs = pgTable("runs", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull(),
  promptVersionId: integer("prompt_version_id").notNull(),
  model: text("model").notNull(),
  output: jsonb("output").notNull(), // SKU output schema (draft)
  usage: jsonb("usage"), // tokens, latency ms
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const corrections = pgTable("corrections", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull(),
  runId: integer("run_id").notNull(),
  targetPath: text("target_path").notNull(), // e.g. "findings[2].citation" | "narrative"
  kind: text("kind").notNull(), // "edit" | "reject" | "add"
  reasonCode: text("reason_code").notNull(), // SKU-defined vocabulary
  before: jsonb("before"),
  after: jsonb("after"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const deliverables = pgTable("deliverables", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull(),
  final: jsonb("final").notNull(),
  reviewSeconds: integer("review_seconds"),
  correctionCount: integer("correction_count").notNull().default(0),
  findingsTotal: integer("findings_total").notNull().default(0),
  findingsAccepted: integer("findings_accepted").notNull().default(0),
  deliveredAt: timestamp("delivered_at").notNull().defaultNow(),
});

export const promptVersions = pgTable("prompt_versions", {
  id: serial("id").primaryKey(),
  tenant: text("tenant").notNull(),
  sku: text("sku").notNull(),
  version: integer("version").notNull(),
  status: text("status").notNull().default("active"), // active | proposed | retired
  systemPrompt: text("system_prompt").notNull(),
  fewShots: jsonb("few_shots").notNull().default([]),
  notes: text("notes"),
  parentId: integer("parent_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const evalCases = pgTable("eval_cases", {
  id: serial("id").primaryKey(),
  tenant: text("tenant").notNull(),
  sku: text("sku").notNull(),
  source: text("source").notNull(), // "correction" | "seed" | "manual"
  sourceCorrectionId: integer("source_correction_id"),
  input: jsonb("input").notNull(),
  expectation: jsonb("expectation").notNull(), // { mustInclude?: string[], mustNotInclude?: string[], note?: string }
  weight: real("weight").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const evalRuns = pgTable("eval_runs", {
  id: serial("id").primaryKey(),
  promptVersionId: integer("prompt_version_id").notNull(),
  results: jsonb("results").notNull(), // per-case pass/fail + grader notes
  passRate: real("pass_rate").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
