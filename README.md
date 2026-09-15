# Tenon

> **Start here (act-one demo):** MOCK RCM reconciliation — IA RCM vs SOX RCM on public-domain bank language. Not a client file. The mitigation supplement tenant is **legacy scaffold**; do not present it as the product.

**The delivery harness for AI-native service companies — without hiring AI engineers.**

This PR adds tenant `rcm/recon` on the existing SKU-as-config harness (review queue, learn loop, selfcheck, embedded PGlite). It does not rewrite the harness and does not revive mitigation supplements.

## MOCK RCM demo (zero setup)

```bash
pnpm install
pnpm db:init          # tables + prompt v1 per SKU (embedded PGlite in ./.tenon-data)
pnpm seed             # Wrenbridge Community Bank — IA RCM vs SOX RCM
pnpm worker           # TypeScript predicates over the fact table (not model prose)
pnpm dev              # http://localhost:3000/recon — MOCK badge, then two named copies, then flags
```

In the UI:

1. Confirm the **MOCK** badge before the matrix opens (`/recon` shows IA RCM and SOX RCM cards).
2. Open the flag matrix. Acknowledge the keyed miss (`ITGC-PS-01`, VLOOKUP-class). Open the semantic flag (same control, drifted wording/owner, quoted cell). Open the frequency flag (both values quoted as an attribute diff).
3. Accept one flag: disposition + one-sentence rationale. Reject one: reason code. Deliver.
4. Export `.xlsx` (preparer, reviewer, date, rejected-flags tab). Read the committee delta (code-computed counts).

Optional, to fire selfcheck review lines without clicking:

```bash
pnpm demo             # accept one + reject one through the real deliver path
pnpm selfcheck        # a line per mechanism that actually fired — do not claim one that is ✗
```

Regenerate the two copies and `ground_truth.json` (exact per-predicate P/R):

```bash
pnpm rcm:generate     # writes src/tenants/rcm/fixtures/
```

Legacy mitigation seed (not the demo path): `pnpm seed:mitigation`.

Real drafting / real Postgres: copy `.env.example` → `.env.local`. RCM flags still come from TypeScript predicates; the model is not the source of the matrix. MOCK vs REAL on the workpaper is **data mode** (this tenant is always MOCK public-domain).

## What the RCM tenant does

- Canonical library in bank language, rewritten from NIST 800-53 / FISCAM ITGCs / FDIC RMS topics. Institution: **Wrenbridge Community Bank, N.A.** (fictional; FDIC BankFind `NAME:"Wrenbridge"` returned 0 hits on 2026-09-15).
- A generator produces **IA RCM** and **SOX RCM** and records every divergence in `ground_truth.json`.
- Column maps ingest each workbook onto a canonical schema. Import sets are keyed by **row hash** (source modified dates are evidence; the wall clock is not the import clock).
- Identity ladder: same-system record id → normalized display id → content hash → fuzzy similarity **flagged for a human, never auto-matched**.
- Fourteen TypeScript predicates. Each flag has two cell locators; unresolved evidence is quarantined and not rendered. Frequency mismatch is `attribute_mismatch` quoting both values — there is no test-vs-operating-frequency conflict predicate.
- Accept requires a disposition (`retain | merge | automate | re-designate | retire | re-own | update`) plus a one-sentence rationale. Reject requires a closed reason code. Rejected rows land on a **rejected-flags** tab that is never deleted.
- Committee delta is arithmetic over counts, not model prose.

## The loop (harness)

1. **Intake** → work item (`intake`)
2. **Draft** — RCM: predicates + identity. Other SKUs: active prompt version + SKU config.
3. **Review** — expert edits in place, rejects with a reason code (RCM: dispositions on accept).
4. **Deliver** — final package + review seconds + acceptance counts (`delivered`)
5. **Learn** — corrections become eval cases; prompt versions are immutable and eval-gated.

Headline metric: **corrections per 100 deliverables** — it should fall.

## Layout

```
src/core       types, SKU registry, metrics
src/db         drizzle schema, dual driver (Postgres | embedded PGlite), DDL
src/ai         thin provider adapter, draft runner
src/learn      mine -> propose -> eval gate -> promote
src/tenants    rcm/ (act-one demo) · mitigation/ (legacy scaffold)
app            Next.js: dashboard, /recon, intake, work queue, review UI, xlsx export
scripts        init-db, seed, seed-mitigation, worker, learn, metrics, rcm-generate
docs/SPEC.md   architecture + ADRs + roadmap
docs/BRIEF.md  historical product brief (mitigation-first; superseded as the demo path)
```

## Honest limits

No mapper UI, no PDF ingest, no auth/RLS, no hash chain, no team sync, no Linkage Memo SKU, no GEPA-as-demo-story. Single reviewer. Eval grader is string-inclusion in mock mode. See SPEC §8.
