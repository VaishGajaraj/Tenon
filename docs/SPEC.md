# Tenon — Architecture Spec (v0.1, Aug 26 2026)

Delivery harness for AI-native service firms. Built to run tenant #1 (the mitigation
claims-documentation firm) and designed so tenant #2 is one config file. The harness encodes
the two gaps the Aug 2026 tooling research found unserved: a **work-product review queue** for
domain experts, and a **corrections → improvement loop** whose headline metric is a falling
correction rate. (Research basis: `ai-workflow-tooling-thesis-aug2026.md` in the Research project.)

## 1. System overview

```
intake ─▶ drafting ─▶ in_review ─▶ delivered
  │          │            │            │
  │    active prompt   reviewer     deliverable row
  │    version + SKU   edits/rejects/adds   (review seconds, acceptance counts)
  │    config → draft  → corrections (structured events)
  │                                    │
  └──────────── learning loop ◀────────┘
        mine corrections → eval cases (regression suite)
        reflect → proposed prompt version (immutable)
        eval gate: proposed must STRICTLY beat active on a non-empty suite
        promote (old version retired, rollback = re-activate)
```

Five subsystems, one process: `src/core` (types, SKU registry, metrics), `src/db` (schema +
dual driver), `src/ai` (provider adapter + draft runner), `src/learn` (the loop), `app/`
(Next.js: dashboard, intake, queue, review UI). Scripts wrap the loop for CLI use.

## 2. Architecture decisions (ADRs)

**ADR-1 — The database is the queue; no external orchestrator.** Work items carry an explicit
status; workers claim rows idempotently. Temporal-class durable execution is deliberately
excluded: 2026 practitioner consensus is that orchestration frameworks are the commodity layer
and their determinism model fights agent workloads; the hard parts are review UX and evals.
Revisit only when there are parallel multi-step agent chains per item (not before tenant #3).

**ADR-2 — Thin provider adapter, no agent framework.** One `complete()` function against the
Anthropic SDK, JSON-in/JSON-out, model names from env. This mirrors what the flagship AI-native
firms actually do (Harvey: provider SDK + own abstractions). Swapping providers = one file.

**ADR-3 — SKU-as-config.** A deliverable type is a `SkuDef`: input schema (zod), intake fields,
reason-code vocabulary, categories, v1 system prompt, user-message renderer, eval rubric, mock
draft. The harness never imports tenant specifics except through the registry. Proof test:
tenant #2 must ship without touching `src/core`, `src/ai`, `src/learn`, or `app/`.

**ADR-4 — Corrections are structured events, and reason codes are mandatory.** Every reviewer
action is `{targetPath, kind: edit|reject|add, reasonCode, before, after, note}`. Free-text-only
feedback is banned in the UI because the learning loop needs machine-readable signal. This is
the single most important design rule in the system.

**ADR-5 — Immutable prompt versions behind a strict eval gate.** Promotion requires strictly
better pass rate on a non-empty suite (ties and empty suites keep the active version — no signal,
no change). More feedback can make prompts worse (Decagon: 500 examples degraded GEPA vs 20–100),
so few-shots are capped at 8 and the prompt may not grow unboundedly. Rollback = re-activate the
parent row. At most one open proposal per SKU.

**ADR-6 — Mock mode is a first-class citizen.** No API key → canned drafts, heuristic reflection,
string-inclusion eval grading. The entire pipeline, review capture, metrics, and gate mechanics
run offline. This exists for demos, tests, and CI — and it forced clean seams between the
pipeline and the model.

**ADR-7 — Embedded PGlite for dev, Postgres for prod, same drizzle surface.** Zero-setup clone-
and-run beats docker-first for a solo founder; `DATABASE_URL` flips to real Postgres unchanged.

## 3. Data model

`work_items` (status machine) → `runs` (immutable draft outputs + prompt version + usage) →
`corrections` (the training signal) → `deliverables` (final output + review seconds + acceptance
counts). Learning side: `prompt_versions` (immutable, one active per SKU), `eval_cases`
(source: correction | seed | manual; expectation = mustInclude/mustNotInclude v1), `eval_runs`
(per-case results + pass rate). Full DDL in `src/db/ddl.ts`.

## 4. The review surface (the product)

The reviewer sees the draft as editable work product, not a chat: edit any finding in place
(auto-marked `edited`), reject with a mandatory reason code, add what the AI missed
(auto-coded `missed_by_ai`), edit the narrative. Deliver computes the final package, correction
events, review seconds, and acceptance counts in one transaction-shaped action. Design rule:
the reviewer never sees prompts, models, or pipeline state — only work product and reasons.

## 5. The learning loop

`pnpm learn [--promote]`: (1) **mine** — each correction becomes an eval case: rejections →
`mustNotInclude` its title; edits/adds → `mustInclude` the corrected content; style edits
weighted 0.25; narrative-only style edits skipped in v1. (2) **propose** — reflection over the
last 100 corrections (clustered by reason code) drafts a new prompt version; with no key, a
deterministic heuristic appends capped learned examples so the loop is demoable. (3) **gate** —
both versions scored on the full suite; real mode drafts fresh outputs per case, mock mode
string-checks. (4) **promote** — strict improvement only; the dashboard's `prompt vN` ticks up.

Metrics that matter (dashboard + `pnpm metrics`): **corrections per 100 deliverables** (headline,
must fall), **finding precision** (Gate-3 kill line: ≥80%), median review time, active version.

## 6. Verified in this build

Typecheck clean; `next build` clean (5 routes); end-to-end run in mock mode: init → seed
(synthetic water-loss claim 44-8871-D) → draft → simulated review (1 rejection with reason code)
→ deliverable recorded (precision 66.7%, 420s review) → learn mined 1 eval case → proposal
created → gate correctly REFUSED promotion on a 0-vs-0 tie. Pages serve real data
(dashboard metrics, delivered view shows accepted findings only).

## 7. Boundaries that keep tenant #1 safe (from the red team / meta research)

Flat-fee, documentation-only: the contractor signs and submits — no adjusting, no negotiation
(UPPA fence; TX HB2103 pattern). No professional-equivalence marketing (FTC DoNotPay order).
Prompt rules forbid coverage conclusions and advocacy language. Engagement letter must disclose
AI use + human review of 100% of output; E&O before first paid deliverable; client documents
never used for cross-client training without consent.

## 8. Known scope cuts (deliberate, ordered next steps)

1. **PDF ingestion** (carrier estimates arrive as PDFs; text paste is v0) — extraction step in
   the pipeline before drafting.
2. **Auth + roles** (single-reviewer localhost today) — needed the week a second reviewer exists.
3. **Model-graded evals** in real mode are per-case redrafts (slow/costly at scale) — add
   sampling + grader model with the SKU's rubric.
4. **Reflection quality** — v1 is one reflection call; upgrade path is GEPA-style iterative
   optimization once eval suites pass ~50 cases.
5. **Multi-reviewer idiosyncrasy** — single reviewer today; when reviewers >1, add per-reviewer
   correction attribution and time-split validation before trusting mined cases (negative-transfer
   risk documented in the research).
6. **Weekly metric snapshots** — corrections/100 is computed live; persist weekly snapshots for
   the trend graph (that graph is the YC slide).
7. **Tenant #2** — estimating-as-a-service or permit expediting share the document-in/findings-out
   shape; shipping one proves ADR-3.
8. **Subagent steps** — SKUs should compose sub-tasks (extract → cross-check → draft) as named
   subagents with per-step telemetry and per-step correction attribution, exposed to non-engineers
   as configuration rather than code. This is the "make subagents easy for white-collar knowledge
   workers" requirement; design constraint: a subagent is a pipeline step in the SKU config, never
   a framework the operator has to learn.
9. **Consolidated observability** — runs already record model/tokens/latency/review-time; add a
   built-in runs view + per-SKU cost so adopters never wire Grafana/LangSmith to get started
   (the Hanover Park interop pain is the anti-goal).

## 9. What this is proof of (the company story)

"We run an AI-native claims-documentation firm on a harness we built. Reviewer corrections are
structured data; they become regression tests and eval-gated prompt versions; our correction
rate per 100 deliverables falls week over week and we can show the graph. The harness spins up
a new service line as one config file." Act one is the firm's revenue; act two is the harness —
sold to the ~56 AI-native service companies per YC batch once it has run a real firm.
