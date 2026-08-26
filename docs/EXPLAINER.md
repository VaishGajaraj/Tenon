# Tenon, Explained

*How the product works, how team sync will work, and whether anyone actually has this problem. Written Aug 26, 2026 — companion to `SPEC.md` (architecture detail) and the repo README (positioning).*

---

## Part 1 — How Tenon works

**One sentence:** Tenon takes a type of deliverable your firm produces, has AI draft it, puts a real review screen in front of your domain expert, records every correction the expert makes as structured data, and uses those corrections to make the AI measurably better — with one number to watch: corrections per 100 deliverables, falling.

### The seven objects

Everything in Tenon is one of seven things:

1. **SKU** — a deliverable type, defined entirely in one config file: what the intake form asks for, the v1 prompt, the categories a finding can have, the reason codes a reviewer can use, the grading rubric, and a canned mock output for offline demos. The mitigation-supplement SKU is ~150 lines. A new service line is a new SKU file — nothing else changes. This is the whole trick.
2. **Work item** — one job moving through the pipeline: `intake → drafting → in_review → delivered` (or `failed`). The database row *is* the queue; there is no Temporal, no job broker.
3. **Run** — one AI drafting attempt, stored immutably: which prompt version, which model, the full output, tokens and latency. Runs are never edited; they're evidence.
4. **Correction** — the heart of the system. When the reviewer changes anything, Tenon records *what* (`edit` / `reject` / `add`), *where* (which finding, or the narrative), *why* (a mandatory reason code like `not_supported_by_docs` or `missed_by_ai`), and the before/after. Free-text-only feedback is deliberately impossible: corrections must be machine-readable because they are the training signal.
5. **Deliverable** — the final approved package, plus the numbers that matter: how long review took, how many findings the AI drafted, how many survived.
6. **Prompt version** — immutable. The learning loop never edits a prompt; it creates version N+1 and retires version N. Rollback is re-activating the old row. At most one open proposal exists per SKU.
7. **Eval case** — a regression test mined from a correction. Reject a hallucinated finding → the suite forever checks that finding doesn't come back. Add a missed item → the suite forever checks it gets found.

### The lifecycle, using the seeded example

The repo ships with a synthetic water-loss claim (44-8871-D): a carrier estimate paying 3 equipment days, a drying log showing 5, photos showing containment that was never billed.

**Intake** (`/intake` or `pnpm seed`): the claim documents go in as text; the item sits at `intake`. **Draft** (`pnpm worker` or the "Run draft" button): Tenon loads the active prompt version, renders the SKU's user message, calls the model (or mock mode with no API key), validates the JSON output against the schema, stores the run, moves the item to `in_review`. The draft finds the 5-vs-3 equipment-day delta with the arithmetic, the unbilled containment, the missing verification visit — each with an IICRC S500 citation and a value range. **Review** (`/work/1`): the expert edits any finding in place, rejects the containment finding with reason `not_supported_by_docs` (photos weren't in the file), adds anything missed. Approve-and-deliver writes the corrections, the deliverable, and the timing in one step. **The dashboard** now shows: 1 delivered, 100 corrections/100, 66.7% precision, 7-minute review.

### The learning loop (`pnpm learn --promote`)

Four steps, each with a reason to exist. **Mine:** new corrections become eval cases — the rejected containment finding becomes a "must not include" test on that claim's inputs. **Propose:** a frontier model reads the active prompt plus the recent corrections clustered by reason code, and proposes the *smallest* prompt change that would have prevented them (plus up to 8 learned examples — capped, because more feedback can make prompts worse; Decagon found 500 examples degraded quality where 20–100 improved it). **Gate:** both the active and proposed versions are scored against the full eval suite. **Promote:** only on *strict* improvement over a non-empty suite. A tie — including 0-vs-0 — keeps the current version. No signal, no change. Every promotion is auditable and reversible.

Why this matters commercially: the whole 2026 tooling market observes (89% of teams have tracing) but doesn't close the loop (37% run online evals; LangChain's own report says the market "hasn't linked traces to systematic quality improvements"). Tenon's loop *is* that link, and "corrections per 100, falling" is the proof artifact.

### The design rules, in one breath

Database as queue (no orchestrator until multi-step parallel agents exist). Thin provider adapter (no framework — the same conclusion Harvey reached). SKU-as-config (tenant #2 must ship without touching core). Structured corrections with mandatory reason codes (the non-negotiable). Immutable prompt versions behind a strict gate. Mock mode as a first-class citizen (the entire loop demos offline, which also forced clean seams).

### Demo it in five commands

`pnpm install` → `pnpm db:init` → `pnpm seed` → `pnpm worker` → `pnpm dev`, then review at localhost:3000, then `pnpm learn --promote` and `pnpm metrics`. No database server, no API key required.

---

## Part 2 — The sync engine: making Tenon multiplayer

The goal: an AI engineering team (or a firm's review team) uses one Tenon together — live queue, no two reviewers clobbering one item, everyone can watch a long agent run, and later, two people in one document.

### The core decision: rows, not CRDTs

Tenon is a server-authoritative row system — work items, findings, corrections — not a freeform canvas. The research verdict is unambiguous: for this shape of app, the winning pattern is the **Linear model** (server is final, last-write-wins with a version check, deltas broadcast to clients), and full client-replica sync engines (Zero, ElectricSQL, PowerSync, Convex) are the wrong first move — they replace the data layer, while Tenon's writes must flow through the eval-gated API anyway (ElectricSQL's own docs route writes through your API). CRDTs earn their complexity in exactly one future spot: live co-editing of narrative text, which is a contained later add-on (Yjs + Hocuspocus 4, MIT-licensed, stable May 2026, pairs with a Tiptap editor).

### The v1 design (3–5 days of work)

Four mechanisms, all copied from tools that already won:

**Claiming with leases** — the LangSmith annotation-queue pattern: `claimed_by` + `claimed_expires_at` columns; claiming an item soft-locks it (others see "Priya is reviewing", can view, can't edit); an atomic `UPDATE … WHERE unclaimed-or-expired` (or `SKIP LOCKED` for "give me the next item") makes claims race-safe; walk away and the lease expires back to the queue. Minutes-long human sessions get lease columns, not open database locks.

**Version check on every edit** — an integer `version` column, compare-and-swap in the update's WHERE clause; zero rows updated means someone got there first → 409 → the client refetches. Field-granular edits make real conflicts rare; warn-don't-block (Front's collision-detection pattern) covers the rest.

**One pub/sub channel for liveness** — Postgres `LISTEN/NOTIFY` feeding a Server-Sent-Events endpoint: queue changes, claims, presence heartbeats, all on one channel; clients receive "something changed" and refetch (payloads stay under NOTIFY's 8KB limit by design). Because dev-mode PGlite is a single embedded connection that can't LISTEN, the transport goes behind a small interface: in-process EventEmitter in dev, LISTEN/NOTIFY in production — same events, same client code.

**An append-only `run_events` table for agent streaming** — every agent-run step is written to the log and a notify fires; viewers tail from their last offset over SSE. Multi-viewer and late-join come free because the durable log is the source, not the socket — and the same log doubles as the audit trail Tenon wants anyway.

### Traps the research flagged (so we don't step in them)

Vercel's native WebSockets (beta June 2026) pin each connection to one function instance with no fan-out — so it's SSE on Vercel, or a $5 node server on Fly/Railway which dissolves the constraint entirely. Supabase's `postgres_changes` does per-subscriber authorization reads (their own docs say use Broadcast instead). Liveblocks open-sourced its sync engine but under AGPL with production self-hosting "not yet." InstantDB's team was just acquired by OpenAI (Aug 22) — off the table. And the one strategic finding: across LangSmith, Label Studio (which literally paywalls review workflows into Enterprise), and Braintrust, **multi-reviewer workflow is the monetized tier** — team sync isn't just a feature, it's plausibly Tenon's pricing axis.

**Deferred deliberately:** narrative co-editing (Yjs when a customer asks), consensus review (N reviewers per item — the schema anticipates it), offline support (nobody in this category has it; Linear-grade engines are months of work).

---

## Part 3 — Does anyone actually have this problem?

The deep-research pass hunted for real complaints (HN, practitioner blogs, GitHub issues, surveys) behind each of Tenon's four components. Honest verdict: **yes — but the evidence reshapes the pitch.**

**Strongest evidence: the review queue.** The freshest 2026 practitioner verbatims describe exactly Tenon's design: "The 'draft freely, promote on approval' method is the only thing I think works" (HN, Apr 2026); "it often takes a lot of engineering to allow the human to boost the output… we used a human review queue for the rest" (HN, Apr 2026). LangChain's 1,340-respondent survey: human review is the #1 evaluation method (59.8%), quality is the #1 blocker (32%). A YC company (HumanLayer) was founded on frameworks "lacking native approval capabilities"; Langfuse's annotation-queue feature requests sit open; Braintrust publishes listicles for the category.

**Second: the learning loop — and it fuses with the first.** The market's own numbers make the case: 89% of teams have observability, 37% run online evals, and LangChain's report names the gap in one line — teams haven't "linked traces to systematic quality improvements." MIT's study blames the 95% pilot-failure rate on the "learning gap": tools that repeat the same errors get abandoned. Verbatim from Feb 2026: "they'd make a mistake, I'd correct them, and later they'd make the exact same mistake again." Review produces corrections; corrections go nowhere today; Tenon is the pipe.

**Loudest but trickiest: framework fatigue.** Complaints about LangChain-era glue are abundant and current ("a pile of glue code nobody wanted to touch," Mar 2026) — but the majority resolution is *minimalism* ("use the provider API directly"), not a bigger platform. Nobody was found asking for a LangChain+Temporal+Grafana replacement bundle by name. So the pitch must be: **Tenon is what you adopt instead of a framework** — the two layers you can't write in an afternoon (the review surface and the learning loop) with the thinnest possible everything-else. Consolidated telemetry is supporting cast: 89% already have observability; that job is filled.

**Weakest pillar: hiring pain.** The aggregate stats are real (~3 open AI roles per qualified candidate; $600K+ frontier-lab medians pricing startups out) but zero first-person founder verbatims of "we can't hire AI engineers" surfaced. Keep it as context in marketing, not as the headline claim.

**The counter-evidence, faced squarely.** The most influential practitioner voice on evals (Hamel Husain) advises teams to *build* their own annotation tool — "a tailored interface in hours" with AI-assisted coding — and a widely-discussed "why eval startups fail" thread argues the buyer is technical enough to DIY. This is the real objection Tenon will meet in every sales conversation, and the answer has to be the part that isn't buildable in hours: the closed loop (corrections → gated promotion → falling correction rate, with the audit trail), the accumulated eval suite, and — per the pricing-axis finding — the team workflow. If the demo doesn't show the correction rate falling, the DIY objection wins.

**Net:** the problem is real, current, and growing — provided Tenon leads with "the review queue that learns" for teams shipping expert-reviewed AI work, and treats "replace your stack" as the outcome, not the pitch.

---

*Sources for Part 3's claims: LangChain State of Agent Engineering (n=1,340); HN threads 47915713, 47915950, 47051518, 42691946, 48637868, 42470541; hamel.dev evals FAQ; HumanLayer YC launch; Langfuse GitHub discussions 8929/4714; MIT NANDA "GenAI Divide". Part 2's: LangSmith annotation-queue docs; the Linear sync-engine reverse-engineering (wzhudev); ElectricSQL docs; Hocuspocus 4 release; Liveblocks OSS announcement; Supabase realtime docs; Vercel WebSocket beta coverage; pglite.dev/docs/sync. Full URL lists live in the session research logs and the Research project docs.*
