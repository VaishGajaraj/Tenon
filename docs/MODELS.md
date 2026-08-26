# Model Economics: Where Frontier Models Actually Bind

*Does deep research — or Tenon's pipeline — need Fable/Opus-class models? Researched Aug 26, 2026 (two deep passes, ~90 sources). Answer: mostly no, with four sharp exceptions. This doc is the task→tier map and what it changes in Tenon.*

## The verdict

Frontier intelligence should be treated as **capital expenditure, not operating expense**. The evidence says frontier models genuinely bind in exactly four places: **(1) planning/decomposition** of open-ended work, **(2) hard-search persistence** (deciding what to find and when to stop — even o3 recalls only 20.9% of expert-core citations, and retrieval quality correlates ρ=0.83 with everything downstream), **(3) reflection** — rewriting prompts from correction clusters (Decagon: GPT-4o-mini as reflector was a complete no-op, "the optimized prompt remained essentially unchanged"; frontier reflectors gained +5–6%), and **(4) final long-form synthesis coherence**. Everything else — extraction, drafting, verification, grading, summarization, relevance filtering — runs on mid/small/open models today, often *better* than frontier once optimized, at 1/10 to 1/90 the cost.

The two flagship proofs: Databricks GEPA-optimized **gpt-oss-120b beat baseline Claude Opus 4.1 on enterprise extraction while ~90x cheaper to serve** (and a Sonnet-as-teacher beat self-optimization — frontier optimizer, cheap student). Ramp + Prime Intellect **RL-trained a ~3B-active-param Qwen agent to 66.25% on their spreadsheet task vs Opus 4.6's 61.88%**, at Haiku latency. Small models don't lose because they're small; they lose when the task is open-ended and long-horizon (SWE-bench: frontier ~96%, gpt-oss-120b 46%; BrowseComp spreads 55 points; per-step reliability compounds as p^n).

## Task→tier map for Tenon

| Pipeline stage | Runtime tier | Why (evidence anchor) | Down-tier lever |
|---|---|---|---|
| Document extraction | **Small/open** (Haiku, gpt-oss, Qwen Flash) after optimization | GEPA gpt-oss > Opus 4.1 at 1/90 cost; domain SLM beat Gemini/Opus/GPT on contract extraction at $0.018/doc with *fewest hallucinations*; Ambience RFT beat physician baseline | GEPA/prompt-opt with frontier teacher; SFT at 1K–10K examples; constrained decoding; **decompose big schemas — 70-field single calls fail at every tier (ExtractBench: 0% on a 369-field schema for all models)** |
| Drafting findings + narrative | **Mid** (Sonnet-class) default | ~80% of Opus writing quality at ~20% cost; the real cheap-model gap is instruction-following, not fluency | Templates + few-shots mined from corrections; cite-then-draft structure |
| Grounding/self-check | **Small/mid + mechanical verifiers** | Deterministic URL/quote checking cut broken citations 16%→0.6%; verbalized self-confidence is unreliable at *every* tier (ECE 0.05–0.20) — never gate on it | Quote-match, URL-resolve, retrieval-overlap tools; smallest models fail only at *acting* on checker output — mid-tier suffices |
| Eval grading vs rubric | **Cascade**: cheap judge ~90% of cases, frontier for close calls | Open-weight judges within a small kappa gap on subjective rubrics; fine-tuned evaluators win on stable rubrics | Calibrate any judge on 100–300 human labels — Tenon's corrections are exactly this set |
| **Reflection (learn loop)** | **FRONTIER — do not down-tier** | Decagon: small reflectors fail totally; reflector is only 5–10% of optimization cost, so skimping is false economy | None. This is the one hard floor |
| Deep research | **Hybrid**: frontier orchestrator/synthesizer, cheaper searchers, deterministic verifier | Anthropic ships exactly this (Opus lead + Sonnet subagents, +90.2% over single-agent Opus); token budget explains 80% of performance variance — spend beats tier; LangChain's pipeline defaults mini-tier summarization with no reported penalty | Parallel cheap readers; frontier only for decomposition, sufficiency judgment, conflict resolution, final write |

## Deep research specifically: what the benchmarks say

The gap between tiers is real but concentrated. Scaffolding beats model choice more often than not: HuggingFace's open pipeline swung **22 points on GAIA from scaffold design alone** (code-actions vs JSON tool calls); a practitioner team measured a **66x token spread across harnesses on identical models**; Anthropic found token budget explains 80% of research-eval variance with model choice in the residual. Perplexity's deep research — reportedly built on a cheap open reasoning model — lands within a few points of o3-based products and *beats them on citation accuracy* (90.2% vs 78%), because citation integrity is bought with verification architecture, not model tier. And the 2026 shift: search-RL-trained small models (Tongyi DeepResearch 30B-A3B, Kimi-Researcher) closed most of the browsing gap — the moat is RL on search trajectories, not parameter count. Where cheap fails catastrophically: un-trained generic models on hard needle-finding (GPT-4o with browsing: 1.9% on BrowseComp) and long coherent synthesis, which is one serial generation you can't parallel-sample into existence.

Cost reality: multi-agent research runs ~15x chat tokens (Anthropic, verified). Mixed-tier routing in tracked production runs cut median cost ~60% at near-equal success; the bigger levers ranked: context re-read management (52% of spend), stopping conditions (the worst logged run burned $187 in an evaluation loop with no exit), then routing.

## What this changes in Tenon

1. **Per-stage model config becomes SKU config.** Today Tenon has two knobs (`TENON_DRAFT_MODEL`, `TENON_REFLECT_MODEL`). The SKU should carry a model map per stage — extract/draft/verify/grade — defaulting to mid-tier drafting, small-tier extraction and grading, frontier reflection only. Ship the cascade: cheap judge grades all eval cases, close calls (within a margin band) escalate.
2. **Routing changes go through the eval gate.** The documented failure mode of cost routing is *silent quality regression*. Tenon already has the answer built: no model downgrade promotes unless it holds the eval suite — the same strict gate that governs prompt versions. Model tier becomes just another versioned, gated variable.
3. **The corrections are the down-tiering asset — this is the margin story.** Every reviewer correction Tenon captures is (a) a judge-calibration label, (b) a few-shot candidate, and (c) SFT training data. The practitioner threshold for a per-task fine-tune is ~1K–10K examples on a stable task — a working SKU crosses that in months. The endgame per SKU: frontier drafts on day 1 → optimized mid-tier by month 2 → fine-tuned small/open model by month 6, with the eval suite guaranteeing quality never regressed. That's a 10–30x runtime cost reduction at current prices (the famous 90x was vs legacy Opus 4.1 pricing; today's frontier is already ~3x cheaper), and it compounds into the moat: competitors can copy the UI, not the correction corpus. Prefer SFT over RFT for this: independent testing found RFT costs 100–700x SFT and only clearly wins on verifier-rewardable agentic tasks.
4. **Never gate anything on model self-confidence.** Escalation and verification hang off mechanical checks (schema validity, quote matching, eval scores) — calibration data says "90% confident" means 70–85% correct across tiers.
5. **For Tenon's own research features** (and how we run deep research for this project): cheap parallel readers, frontier decomposition and synthesis, a deterministic citation verifier, explicit stopping conditions, and aggressive context caching. Tier is the *fourth* most important cost lever, after token budget, context management, and harness design.

## Production telemetry (Datadog, State of AI Engineering 2026)

Datadog's report is anonymized production telemetry from thousands of orgs — methodologically stronger than a survey for what it measures, and vendor-published, so read the framing (they sell observability) separately from the numbers. Four findings that bear directly on this document:

- **"Operational complexity — not model intelligence — is becoming the primary barrier to reliable AI at scale."** This is the thesis of this doc, now supported by production data rather than argument.
- **~5% of LLM API calls error, ~60% of those are rate limits** (8.4M rate-limit events on one provider's API in a single month). This is why the eval gate distinguishes infrastructure errors from graded failures — without that, whichever version is scored second is systematically penalized. Batch APIs and caching are reliability levers, not just cost levers.
- **69% of input tokens are system prompts, but only 28% of calls use prompt caching.** Tenon's system prompt is immutable per prompt version, which makes it the ideal caching target: cache reads are 0.1x input price. Queued change — a `cache_control` block on the system prompt in the provider adapter is the single highest-ratio cost lever available to this codebase.
- **Agent-framework adoption doubled but reached only ~17.5% of orgs, and 59% of agentic requests still make a single service call.** Most production "agents" are one model call with tools. This supports ADR-1 and ADR-2: the orchestration framework tax is real and mostly unnecessary at this scale.

One more use of the existing machinery this data suggests: **teams add models faster than they retire them** ("model churn becomes a governance problem"), with no way to know whether a swap degraded quality. Tenon's eval gate answers exactly that question — gate the *model change* against the held-out suite, not just the prompt change. Same mechanism, no new code.

## Cost ratio cheat sheet (Aug 2026, output-weighted, Opus 5 = 1.0)

Frontier-premium (GPT-5.5 Pro-class) ~6x; **frontier (Opus 5, GPT-5.6 Sol) 1.0** ($5/$25 per Mtok); mid (Sonnet 5, Terra) ~0.4; small closed (Haiku 4.5, nano/Luna) ~0.05–0.2; **open hosted (gpt-oss-120b, DeepSeek V4 Flash, Qwen Flash) ~0.01–0.03** — a ~100x usable spread, before batch (−50%) and cache reads (0.1x input) stack on top.

## Honest caveats

The Databricks 90x figure is against retired Opus 4.1 pricing. GEPA optimization itself costs ~3x extra calls and hours of compute — a per-SKU investment, amortized. Several leaderboard numbers (BrowseComp/SWE-bench by tier) come from aggregators, not primary boards. Salient's specific distillation pipeline could not be verified at a primary source. And one asymmetry to respect: cheap models fail *silently* (subtle instruction drift, confident hallucination under distractors — small models also degrade earlier on long contexts), which is precisely why the review queue and eval gate exist. Tenon isn't just compatible with cheap models; it's the apparatus that makes using them safe.

---

*Key sources: databricks.com (GEPA/IE Bench), decagon.ai (GEPA in production), labs.ramp.com + primeintellect.ai (RL small agent beats Opus), developers.openai.com (RFT case studies), anthropic.com/engineering (multi-agent research system), arxiv 2604.03173 (citation verification), arxiv 2602.12247 (ExtractBench), arxiv 2601.12369 (TaxoBench retrieval bottleneck), trychroma.com (context rot), tensorzero.com (RFT vs SFT economics), lm-sys RouteLLM, langchain open_deep_research README, quesma.com (harness cost engineering), platform.claude.com + cloudzero (pricing). Full URL lists in the session research logs.*
