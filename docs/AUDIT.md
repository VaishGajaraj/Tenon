# Audit & the Stateful-Swarms Lesson

*Aug 26, 2026. Two investigations that turned out to be the same investigation: a study of `dl1683/irys-stateful-swarms`, and an adversarial audit of Tenon v0.1. Both found elaborate machinery that did not fire. This documents what was learned, what was adopted, and what was fixed in v0.2.*

---

## Part 1 — What irys-stateful-swarms actually teaches

The repo claims that coordination architecture beats model intelligence: cheap Gemini Flash models, coordinated through a persistent typed "blackboard" with provenance, confidence, contradiction detection and convergence gates, reaching professional-grade results on the Harvey Legal Agent Benchmark where the same models score zero in ordinary agent scaffolds. It is a serious piece of engineering — 22,600 lines of Python, 439 passing tests, two complete architectures, a working MCP server, examples with full per-iteration state snapshots.

**The headline claims should be read carefully.** The README now reports 31.6% strict all-pass at $5.11/task on LAB v1.0; the whitepaper, the failure analysis, and the shipped benchmark manifest all still describe the older 17.75% at $1.30 on 1,251 tasks. The repo does not reconcile them, ships no manifest or analysis for the newer number, and the README explicitly withholds the model configuration behind it — which means the central "architecture over model intelligence" argument can no longer be checked against the headline. The cost comparison against frontier models chains a different task set to an extrapolated (not measured) price.

**The most valuable artifact in the repo is `FAILURE_ANALYSIS.md`** — 2.4MB, 49,752 lines, 222 investigative sections, and unusually honest. It substantially contradicts the marketing surface, and I verified its core admissions independently against the shipped example blackboards:

| Mechanism the architecture is sold on | What actually happened |
|---|---|
| Typed cross-references (supports / contradicts / supersedes) | **0 of 27,549 entries** had any cross-reference. In the two flagship examples I measured: 0 contradicts, 0 supersedes, 0 non-active entries |
| Confidence as signal | 97–99.5% of entries sat at ≥0.9; **0 below 0.4**, so the "disputed" threshold is unreachable. The field carries no information |
| Signal/question closure | **0 of 18,845 signals** resolved; 78.5% left open |
| Early convergence | **0 tasks ever converged early** — every run burned all 12 iterations, because speculative questions marked "critical" block convergence permanently |
| Iterative refinement | 88–96% of all entries came from **iteration 1**; iterations 2–12 contributed almost nothing |
| Feature completeness | ~3,500 lines behind feature flags **had never affected a benchmark score** |

Their own conclusion about what drives the score: *"70% of outcome is determined before execution"* — file count, task verb and category predict most of the variance. Draft-type tasks pass at 40%, identify-type at 0%. What works is high-volume parallel extraction feeding long-form generative synthesis, not stateful reasoning. And the fragility is striking: one whitelist change took the system from 27.1% to 0%; 46% of criteria flips between runs were regressions.

**So: can it improve how AI is used for tasks generally?** Yes — but not through the parts it advertises.

**Worth adopting.** (1) **Deterministic gates on model output.** Their `passes_quality_gate` rejects entries before they reach shared state on purely mechanical grounds — an observation with no source document, a "calculation" containing no digits or operator, content under 20 characters. No model call, no self-assessment. (2) **Source custody** — entries claiming a document that cannot be matched to a real one are quarantined, cascading to derived entries. This is the mechanical-verification principle in `MODELS.md`, implemented. (3) **The adversarial gate**: a second reviewer prompted *"the orchestrator says analysis is COMPLETE. Find reasons it is NOT"*, defaulting to reject on parse failure. Asymmetric prompting beats asking a model to grade itself. (4) **`packages/blackboard-mcp`** is the cleanest, least over-claimed thing in the repo — a deterministic, zero-API, zero-cost structured-state layer for any coding agent, with convergence computed by pure arithmetic (`critical signals > 0 || disputed > 0 || unread docs > 0`). (5) **The instrumentation discipline itself** — measuring your own mechanisms until you can prove they fire.

**Worth refusing.** Typed cross-reference graphs, confidence decay, and elaborate signal lifecycles. Their own data says a general-purpose model will not populate them, because workers never see the whole board and cannot reference entries they have not been shown. Sophisticated state schemas that models don't fill in are ornamental.

**The transferable law:** *an architecture is only what fires.* Everything else is a diagram.

---

## Part 2 — The same disease, found in Tenon

An adversarial audit of Tenon v0.1 found the identical pattern in miniature. The pipeline and review surface were sound; the learning loop — the thing the entire company story rests on — did not do what the documentation claimed.

**The five that mattered:**

1. **The offline eval gate was a tautology.** `draftForEval` accepted a prompt version and ignored it, so in mock mode the active and proposed versions produced byte-identical output. The gate could never promote, by construction. The SPEC recorded this as "the gate correctly refused promotion" — it was the only state the system could occupy. The one thing the offline demo could not show was the loop closing.

2. **Mined eval cases were non-discriminative.** Corrections became naive string matches. An edit that fixed a citation but left the title alone produced `mustInclude: [<unchanged title>]` — a case the un-fixed prompt already passes, forever, testing nothing. Reviewer-added findings produced `mustInclude: [<the human's exact wording>]`, which a model will essentially never regenerate — failing forever. Worse, vacuous always-pass cases drag both versions toward 100%, *shrinking* the gap a genuine improvement can produce. The loop's asymptotic behavior was: more data, less promotion.

3. **Total train/test contamination.** Eval cases reused the exact input of the item whose correction produced them, and that same correction was fed to the reflection model. The gate was grading memorization of the answer key.

4. **Both headline metrics were maximized by doing nothing useful.** Emit fewer findings → fewer rejections → corrections/100 falls *and* precision rises, while the actual product value (supplement dollars found) collapses. Nothing measured recall. The metric was also a lifetime average that structurally could not move week over week, and could not be sliced by prompt version — so "v3 beats v2" was unprovable from the data being collected.

5. **Every number was client-reported.** `findingsTotal`, `findingsAccepted`, and `reviewSeconds` came from the browser and were written verbatim. A metric self-reported by the party being measured is not evidence. Alongside it, `submitReview` was non-transactional and non-idempotent, so a retry double-counted corrections — the failure mode of the integrity mechanism was inflating the integrity metric.

Plus one contractual problem: correction payloads quoting client documents were fed to the reflection model, and the resulting few-shots were appended to the shared system prompt for every future draft — precisely what SPEC §7 promises clients does not happen.

## Part 3 — What v0.2 changes

**The gate is now a real mechanism.** `mockDraft(input, promptVersion)` — learned examples actually change the offline draft, so a prompt version can be shown to be better or worse without an API key. This is now asserted by a test, and the end-to-end run promotes: the active version scores 0% on the held-out suite (it keeps emitting the finding reviewers rejected), the proposed version scores 100%, and it is promoted on the evidence.

**Mining produces cases that can fail.** Each reason code declares how it becomes an expectation (`forbid_title`, `forbid_citation`, `require_terms`, `none`), so a citation fix produces a citation-specific test rather than a vacuous title test. Every candidate is validated at mine time by running the *current* version against it: if it already passes, it is stored but marked non-informative and excluded from grading.

**Train/test is split.** Every third case is held out, hidden from the reflector, and only held-out informative cases are graded. Promotion additionally requires a minimum suite size and improvement beyond a margin — no more promoting on a one-case coin flip.

**Grounding is checked mechanically, before a human sees it.** Adopted from source custody: a finding whose distinctive terms are largely absent from the source documents is quarantined and recorded. No model call, no self-reported confidence (which the research says is uncalibrated at every tier).

**Metrics have counterweights and can move.** Findings per deliverable and reviewer-added misses sit next to corrections/100 on the dashboard, so a quieter model is visibly a quieter model. Everything is windowed to 30 days and sliced by prompt version.

**Delivery is transactional, idempotent, and server-authoritative.** The status transition is the concurrency guard; corrections are validated against the SKU vocabulary and against findings that actually exist in the run; every metric is derived server-side; business logic moved from the app layer into `src/core/review.ts` so scripts and tests exercise the same path the UI does.

**Client content cannot reach the shared prompt.** A mechanical leakage guard rejects any learned example containing a claim-reference pattern or a long verbatim run from a correction payload. Instruction alone is not enforcement.

**And the lesson from the swarms failure analysis became a command.** `pnpm selfcheck` reports, for every mechanism Tenon claims, whether it has ever actually fired: runs recorded, grounding checks run and quarantines triggered, corrections captured and which reason codes have never been used, cases mined and how many are informative, whether the gate has ever promoted, whether learned examples are in the active prompt, and whether any misses have ever been recorded. On the current database it says the loop closed — and honestly flags that grounding has not yet fired and that recall is unmeasured. A mechanism that has never fired is a claim you cannot make.

## Part 4 — What remains open

Ranked, from the audit's own list: no authentication on server actions (they are public POST endpoints — a session gate and a rate limit on the drafting action are required before this is reachable off localhost); the eval rubric on each SKU is still unused, so the model-graded cascade described in `MODELS.md` is designed but not built; the eval suite grows without bound with no sampling or retirement; `DraftOutput` remains hardcoded to findings-plus-narrative, so ADR-3's "tenant #2 without touching core" holds only for another document-review SKU of the same shape; SKUs are compiled modules in a hardcoded registry, so customers cannot yet author one; and there are no database migrations (raw idempotent DDL with in-place ALTERs). These are tracked in SPEC §8 and none of them are load-bearing for the current thesis — unlike the five above, which were.

---

*Sources: `github.com/dl1683/irys-stateful-swarms` (README, whitepaper.md, FAILURE_ANALYSIS.md, `src/swarm/*`, `packages/blackboard-mcp`), read at commit 017df3a on branch `master`; claims verified against the repo's own shipped example blackboards where possible. Tenon audit performed against v0.1 at commit 4b1d5c0.*
