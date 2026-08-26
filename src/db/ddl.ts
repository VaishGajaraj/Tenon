/** Idempotent DDL, executed by scripts/init-db.ts against either driver. */
export const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS work_items (
    id SERIAL PRIMARY KEY,
    tenant TEXT NOT NULL,
    sku TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'intake',
    title TEXT NOT NULL,
    input JSONB NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS runs (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL,
    prompt_version_id INTEGER NOT NULL,
    model TEXT NOT NULL,
    output JSONB NOT NULL,
    usage JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS corrections (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL,
    run_id INTEGER NOT NULL,
    target_path TEXT NOT NULL,
    kind TEXT NOT NULL,
    reason_code TEXT NOT NULL,
    before JSONB,
    after JSONB,
    note TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS deliverables (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL,
    final JSONB NOT NULL,
    review_seconds INTEGER,
    correction_count INTEGER NOT NULL DEFAULT 0,
    findings_total INTEGER NOT NULL DEFAULT 0,
    findings_accepted INTEGER NOT NULL DEFAULT 0,
    delivered_at TIMESTAMP NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS prompt_versions (
    id SERIAL PRIMARY KEY,
    tenant TEXT NOT NULL,
    sku TEXT NOT NULL,
    version INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    system_prompt TEXT NOT NULL,
    few_shots JSONB NOT NULL DEFAULT '[]',
    notes TEXT,
    parent_id INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS eval_cases (
    id SERIAL PRIMARY KEY,
    tenant TEXT NOT NULL,
    sku TEXT NOT NULL,
    source TEXT NOT NULL,
    source_correction_id INTEGER,
    input JSONB NOT NULL,
    expectation JSONB NOT NULL,
    weight REAL NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS eval_runs (
    id SERIAL PRIMARY KEY,
    prompt_version_id INTEGER NOT NULL,
    results JSONB NOT NULL,
    pass_rate REAL NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
  )`,
];
