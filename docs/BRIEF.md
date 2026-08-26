# Tenon — Product Brief

*The canonical document. Replaces reading the eight research docs; links to them where depth is needed. Last updated Aug 26, 2026.*

---

## 1. What it is

**Tenon is the delivery machinery for businesses whose product is expert-reviewed AI work.** You define a deliverable type once as config; AI drafts it from documents; a domain expert reviews the draft as *work product* — editing in place, rejecting with a reason code, adding what the AI missed; every correction is captured as structured data; and a gated learning loop turns those corrections into a measurably better system. The number that says it's working: **corrections per 100 deliverables, falling — while findings per deliverable holds.**

Seven objects, no more. A **SKU** (a deliverable type: input schema, prompt, categories, reason codes, rubric — one file, ~150 lines). A **work item** flowing `intake → drafting → in_review → delivered`; the database is the queue, there is no orchestrator. A **run** (one immutable drafting attempt with its prompt version, model, tokens, latency). A **correction** — what changed, where, *why* (mandatory reason code), before and after. A **deliverable** with server-derived metrics. An immutable **prompt version** on a branch. An **eval case** mined from a correction.

The loop: mine corrections into discriminative eval cases → reflect over clusters to propose new prompt versions on named branches → gate every branch against the active version on a held-out suite → promote only the single best that clears a margin. Failed attempts keep their scores and their content-hash signatures, so a change that already lost is never proposed again.

## 2. Why it exists

Two things were hard at Hanover Park and are hard everywhere: **surfacing AI work in a UI a domain professional can actually use**, and **making the system learn from their corrections**. The 2026 evidence says both are still unsolved in the market and that they are one fused problem.

- Human review is the **#1 evaluation method** — 59.8% of 1,340 teams surveyed by LangChain — and **quality is the #1 blocker** (32%).
- **89% of teams have observability; only 37% run online evals.** LangChain's own report names the gap: the market "hasn't linked traces to systematic quality improvements."
- MIT's study blames the 95% enterprise-pilot failure rate on the **learning gap** — tools that repeat the same errors get abandoned. A practitioner in Feb 2026: *"they'd make a mistake, I'd correct them, and later they'd make the exact same mistake again."*
- Every horizontal platform's human-in-the-loop is an **approval gate** (approve/reject a step), not a work-product review queue. Only Harvey and FloQast approximate the real thing, both enterprise-priced.
- **Nobody ships a closed loop** where a reviewer's edits automatically improve the system behind guardrails. Databricks' ALHF is closest and is platform-locked.

Full evidence: `ai-workflow-tooling-thesis-aug2026.md`, `tenon-explainer-aug2026.md` Part 3.

## 3. The strategy: two acts, in this order

**Act one — be the firm.** Run a real AI-native service on Tenon: an **AI-native claims-documentation firm for water and fire mitigation contractors**. Flat-fee, documentation-only; the contractor signs and submits. This was chosen by adversarial red team over three alternatives (see §6) and is the revenue vehicle.

**Act two — sell the machinery.** Once the harness has run a real firm, sell it to the ~56 AI-native service companies per YC batch and to rollup holdcos that need repeatable delivery across many acquired firms.

**Why this order is non-negotiable.** Every flagship AI-native firm — Harvey, Sierra, Decagon, EvenUp, Crosby, Basis — built this machinery in-house because they consider it their moat. The DIY objection ("I can build a review queue in a weekend with Claude Code," which the most influential practitioner voice on evals actively recommends) is the central sales risk, and the only thing that beats it is *"we ran a real firm on this; here is the correction rate falling on live client work."* Sierra and Decagon both productized machinery they built to deliver their own service. That is the proven path.

## 4. Where it actually stands (Aug 26, 2026)

**Built and verified.** v0.3, six commits. Typecheck clean, 9 offline tests, production build clean. The full loop runs end to end with no API key and no database server: seed → draft → review → deliver → mine → propose on branches → gate → promote. Verified behaviors: the gate promotes a genuinely better version and refuses a tie; a change that already lost is never re-proposed; ungrounded findings are quarantined before a human sees them; delivery is transactional and idempotent; every metric is server-derived.

**Not built.** Authentication (server actions are public POST endpoints — required before any non-localhost deployment). PDF ingestion. Model-graded eval cascade. Team sync. Database migrations.

**The honest gap.** **Zero users. Zero revenue. Zero customer conversations.** Gate 1 of the red-teamed plan — 10–15 discovery calls with mitigation contractors, due Sept 8 — has not started. This is the only thing standing between the current state and a fundable one.

Repo: `github.com/VaishGajaraj/Tenon` (created; push pending from a machine with credentials).

## 5. What the research settled

**Model economics** (`tenon-model-economics-aug2026.md`, incl. its correction notice). Frontier models bind in four places: planning/decomposition, hard-search persistence, **reflection** (small models fail completely at rewriting prompts from corrections), and long-form synthesis; everything else runs on cheap models. **But the cost and compounding numbers this doc previously carried did not survive verification** — the Databricks "optimized cheap model beats frontier at 10–90x less" family of claims names no benchmark, baseline or cost method and has no independent replication, and every GEPA efficiency figure was refuted 0-3. **There is no verified answer to "how many corrections before an optimized prompt beats a frontier baseline,"** and the one surviving signal (20–100 examples outperforming 500) suggests the asset saturates early. The margin story is a hypothesis to test on your own data, not an established result.

**The learning loop is not proprietary technology.** GEPA — reflect on execution traces, propose, gate on a held-out set, accept only on measured improvement — is peer-reviewed (ICLR 2026 Oral), MIT-licensed and pip-installable, and is the same algorithm Databricks, MLflow and Google ADK wrap and sell. Tenon's differentiation cannot be the algorithm. What survived 3-0 as the real vendor advantage is **packaging, the domain-specific eval harness, and a three-to-six-week implementation contract requiring an engineering team** — and that contract is precisely what prices the down-market segment out. That is the opening, and it is an argument assembled from verified facts, not a sourced claim.

**Direct competitor now occupying adjacent ground (Aug 2026).** Gumloop ($70M+ raised, Benchmark/First Round/YC; Gusto, Ramp, Shopify, Samsara, Instacart, Opendoor as customers) published a CIO-targeted governance guide whose positioning line is *"the people closest to the problem build the agents, no engineers required"* — the same democratization claim Tenon makes, delivered with SSO, RBAC, audit logs, VPC deployment and spend caps. Two findings from it matter:

- **They ship agent self-improvement**: after each run an agent reflects on its execution trace and "fine-tunes its own configurations." But it is scoped to **cost** — wasted tokens, redundant calls — not output quality, the signal is the agent's own trace rather than expert corrections, and **there is no eval gate**: the agent adjusts itself with no held-out verification or promotion discipline. Tenon's loop optimizes a different variable through a different signal behind a gate. That is now the precise differentiation, and it is narrow.
- **93% of agent runs fire without a human prompt** (their telemetry: 18M+ production runs across 30 enterprise deployments of 50+ seats). Most enterprise agent work is fire-and-forget internal ops. **The expert-reviewed deliverable segment is a minority of agent workloads** — Tenon's market is narrower than "AI-native companies," and this is the strongest available evidence for that.

They also independently validate several design choices: HITL checkpoints placed by blast radius (reversible/internal → automate; irreversible, customer-facing or regulated → approval gate), the audit trail framed as "reconstruct what the agent proposed, what the human decided, and why," model-neutral routing to open weights where frontier accuracy is not required, and data sovereignty as the reason to keep inference in the client's perimeter.

**Competitive position.** The horizontal no-code middle is a graveyard — StackAI exited to Asana for $75M, Relay.app (best-in-class review UX) shut down, HumanLayer and Zenbase both pivoted — while money concentrates at infra (n8n, $2.5B) and vertical done-for-you (Harvey ~$150M ARR, Basis $1.15B). Platform bundling squeezes from below. **Tenon's defensible position is not "better workflow builder"; it is the review-and-learning layer proven by running a firm.**

**Team sync** (`tenon-explainer-aug2026.md` Part 2). Design settled: server-authoritative rows with lease-based claiming (LangSmith's pattern), version checks on edits, one Postgres LISTEN/NOTIFY→SSE channel, an append-only run-events log for multi-viewer agent streaming. No CRDT except optional narrative co-editing later. ~3–5 days. Strategic note: **multi-reviewer workflow is the monetized tier across LangSmith, Label Studio and Braintrust** — team sync is plausibly the pricing axis.

**Adopted from others' published work** (`tenon-audit-and-swarms-aug2026.md`). From irys-stateful-swarms: deterministic gates on model output, source-custody quarantine, and above all the instrumentation discipline — their own failure analysis showed 0 of 27,549 entries ever used the cross-reference machinery they were built on. That produced `pnpm selfcheck`, which reports whether each Tenon mechanism has ever actually fired. From Modern Relay's public writing: git-style branching for versions and retaining failed attempts as knowledge.

## 6. Decisions closed (with revisit triggers)

| Decision | Basis | Revisit if |
|---|---|---|
| Mitigation supplements as act one | Red team: only candidate where fatals attached to a *positioning*, not the market; escapable via reposition two lenses independently endorsed | Gate 1 shows incumbents already serve mitigation adequately |
| Service first, platform second | Every comparable firm built in-house; DIY objection is unanswerable without a proof point | 5 AI-native startups pay for the harness before the service has customers |
| Flat-fee, documentation-only | UPPA enforcement pattern (TX HB2103); contingency pricing on insurance recovery is the fact pattern | Counsel clears a different structure in writing |
| No orchestration framework | 2026 consensus: orchestration is commodity, assembly is the hard part; Harvey uses a provider SDK | Multi-step parallel agent chains per item |
| Row-based sync, no CRDT | Linear's model; CRDTs earn complexity only for concurrent text | Customers demand live co-editing of narratives |
| Games ideas killed | Red team: three-lens clean sweep (broke buyers, occupied wedge, SOTA gap) | — |

## 6b. What a verification pass could NOT establish (Aug 26, 2026)

A 107-agent adversarial research pass returned 8 confirmed findings and killed 17. The confirmed ones are all about *platforms*; **the business case is unevidenced, not disproven.** Nothing survived on: which service lines to rank first, what any of them price at, whether a corrections corpus compounds, or how to run several at once. Specifically refuted: the Bessemer vertical-AI gross-margin and burn benchmark (0-3), per-deliverable pricing benchmarked below displaced labor cost (1-2), quality-over-volume compounding (0-3), the $57.23-per-denied-claim and $25.7B adjudication figures (0-3), and **all three NAIC public-adjuster licensing claims — both the barrier and the technical-assistant carve-out.** That last one matters most: the licensing status of the claims-documentation SKU is now **neither cleared nor blocked**, which raises the priority of the one-hour counsel review inside Gate 1 rather than lowering it.

One hard negative worth acting on: **customs entry and classification is legally closed** to an unlicensed operator. 19 U.S.C. §1641 defines customs business to include *the preparation of documents* "whether or not signed or filed by the preparer," and CBP ruling H350722 (Jan 2026) holds that automated extraction does not launder the restriction — unlicensed parties may suggest HTSUS classification only to the 6-digit level. Remove it from any SKU shortlist as a direct-to-importer service, or reposition it as a broker-side tool.

Also validated (3-0): enterprise vendors treat procedures as **first-class versioned software artifacts** — Git-based tracking, commits and diffs, branch protection, unit tests, regression replay of historical transcripts, A/B promotion and change alerting. That is independent confirmation of eval-gated promotion and of the branching model added in v0.3.

## 7. Risks and falsifiers

**The authoring-surface risk, newly identified.** Every enterprise vendor has converged on **natural-language procedure authoring** for domain operators, explicitly positioned against SDKs — Decagon's framing is "define agent behavior in natural language, the same way you train human agents with SOPs." A Tenon SKU is a TypeScript config file: an SDK-shaped surface. No verified source shows non-engineers succeeding unaided at *either* modality, but the convergence is one-directional and against us. **If a domain expert cannot author a SKU without an engineer, the down-market thesis loses its point** — and that is testable cheaply by handing the SKU file to one non-engineer.

**The DIY objection** is the central commercial risk and is currently unanswered by evidence — and it got harder, because the optimizer is free and pip-installable. **Incumbent bundling** — Databricks, Braintrust and Langfuse are each one release from shipping the loop. **The corrections corpus may not compound** — the honest counterargument is that frontier model improvements erase accumulated advantage; this is unproven either way and is the subject of the open deep-research pass. **Metric gaming** — corrections/100 is minimized by an AI that finds less; counterweights are built but unvalidated on real work. **Founder pattern** — seven directions in 48 hours with Gate 1 unstarted; the named failure mode is completing research and builds while never sustaining outreach.

## 8. Path to YC W27

The W27 deadline is unpublished; the 4-batch cadence puts it plausibly **late September to early November**. Check ycombinator.com/apply weekly.

What a fundable application looks like: *"We're an AI-native claims-documentation firm. We do the work, we own the output, we charge per deliverable. Our delivery machinery captures every expert correction and turns it into measured improvement — here's the correction rate falling on real client work, and here's the honest audit of which mechanisms fire. The machinery is act two."* Context: **28% of YC W26 were AI-native service companies** and 11% were solo founders — but traction is the accepted compensator for being solo, and W26 set a record with 14 companies at $1M+ ARR by Demo Day.

**The gates that produce it.** Gate 1 (Sept 8): 10–15 discovery calls; written evidence the mitigation segment is underserved, or kill. Gate 2 (Sept 15): retrospective audits of ≥10 settled claims averaging $1,500+ in confirmed missed scope. Gate 3 (Sept 25): ≥2 prepaid pilots with cash collected and ≥5 contractors submitting claims — LOIs do not count. Apply late in the window, then use the application-update feature to show the graph rising.

**Verdict as of today: not yet.** The software is an asset, not an application. The distance to a real one is two to three weeks of conversations, not commits.

## 9. Document map

`00-tenon-product-brief.md` (this) · `tenon-harness-spec.md` architecture + ADRs · `tenon-explainer-aug2026.md` how it works, sync design, demand evidence · `tenon-model-economics-aug2026.md` task→tier map, cost strategy · `tenon-audit-and-swarms-aug2026.md` audit findings, adopted patterns · `ai-workflow-tooling-thesis-aug2026.md` the market thesis · `launch-pick-red-team-aug2026.md` the gated 30-day plan · `rebuilding-boring-businesses-with-ai-aug2026.md` the AI-native services meta.
