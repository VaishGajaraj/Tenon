# Tenon

> **Start here:** [`docs/BRIEF.md`](docs/BRIEF.md) — what this is, why, where it stands, and what happens next.

**The delivery harness for AI-native service companies — without hiring AI engineers.**

If your company does the work (claims, contracts, closes, audits) with AI plus expert review,
you end up building the same stack every time: orchestration glue, an eval harness, a review
UI for your domain professionals, observability wiring, and some way to learn from corrections.
Tenon consolidates that into one framework so a small team ships it in a day instead of
stitching LangChain + Grafana + an eval vendor + a homegrown review queue:

- **SKU-as-config** — define a deliverable type in one file (input schema, prompt, reason codes,
  rubric); the pipeline, UI, and learning loop come for free
- **A real review queue** — your accountant/lawyer/analyst edits work product in place, rejects
  with reason codes, adds what the AI missed; approval-gates are not review
- **Corrections → learning** — every correction becomes a regression test; prompt versions are
  immutable and promoted only through a strict eval gate; the headline metric is
  **corrections per 100 deliverables, falling**
- **Built-in run telemetry** — model, tokens, latency, and review time recorded per deliverable;
  no external observability stack required to start
- **Runs offline** — embedded database + mock model mode; demo the whole loop with zero setup

Reference tenant included: a claims-documentation service for water/fire mitigation contractors
(`mitigation/supplement-review`). Adding your own service = one new `SkuDef` file.

## Quick start (zero setup — embedded DB, mock model)

```bash
pnpm install
pnpm db:init     # creates tables (embedded PGlite in ./.tenon-data) + seeds prompt v1
pnpm seed        # one synthetic water-loss claim
pnpm worker      # drafts intake items (mock mode without ANTHROPIC_API_KEY)
pnpm dev         # http://localhost:3000 — review the draft, reject/edit/add findings
pnpm learn       # corrections -> eval cases + proposed prompt version
pnpm learn --promote  # eval-gate the proposal against the active version, promote if better
pnpm selfcheck   # does each mechanism actually fire?
pnpm metrics     # corrections/100, finding precision (Gate-3 kill line: 80%), review time
```

Real drafting: copy `.env.example` → `.env.local`, set `ANTHROPIC_API_KEY`.
Real Postgres: `docker compose up -d` and set `DATABASE_URL`.

## The loop (why this exists)

1. **Intake** → work item (`intake`)
2. **Draft** — active prompt version + SKU config → findings + narrative, self-checked (`in_review`)
3. **Review** — expert edits in place, rejects with a reason code, adds what the AI missed.
   Reason codes are mandatory on every change: they are the training signal.
4. **Deliver** — final package + review seconds + acceptance counts recorded (`delivered`)
5. **Learn** — corrections become eval cases (regression suite); a reflection pass proposes a
   new immutable prompt version; the **eval gate** must pass before promotion; rollback = re-activate
   the parent version.

Headline metric: **corrections per 100 deliverables** — it should fall.
Kill line (Gate 3): **finding precision ≥ 80%** (reviewers reject less than 1 in 5 flags).

## Layout

```
src/core       types, SKU registry, metrics
src/db         drizzle schema, dual driver (Postgres | embedded PGlite), DDL
src/ai         thin provider adapter (no framework — deliberate), draft runner
src/learn      mine -> propose -> eval gate -> promote
src/tenants    one folder per tenant; a tenant is just SkuDef files
app            Next.js: dashboard, intake, work queue, review UI
scripts        init-db, seed, worker, learn, metrics
docs/SPEC.md   architecture + ADRs + roadmap
```

## Honest limits of this scaffold (see SPEC §8)

Single reviewer, no auth; text-paste intake (PDF extraction is a listed next step); the eval
grader is string-inclusion in mock mode and model-graded only with a key; the reflection step
is capped and eval-gated but still v1. These are scoped, not forgotten.
