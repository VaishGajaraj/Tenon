# Retrieval (model share only)

Tenon does **not** turn predicates into LLM calls. Retrieval exists so fuzzy-match proposals and rationale drafts can cite evidence without dumping workbooks into the shared system prompt.

## SOTA-inspired vs what shipped

| Idea (2026 retrieval practice) | Shipped in this PR |
| --- | --- |
| Hybrid lexical + dense retrieval over chunked source text | **Yes, in miniature:** BM25-lite (tf-idf cosine) + hashed character 3-gram vectors |
| Trained embedding model (e.g. `text-embedding-3-small`, Voyage, MiniLM) | **Optional only.** Set `TENON_EMBED_URL` to an OpenAI-compatible embeddings endpoint. MOCK demo does not require it. |
| Agent framework / tool-calling RAG loop | **No.** ADR-2 thin adapter. One `retrieve()` function. |
| Raw copy pasted into the system prompt | **Forbidden.** System prompt mentions chunk ids; user message for model share is `{chunkId, locator, quote}` |

Hashed 3-gram vectors are **not** a trained embedding model. They keep the hybrid path deterministic with zero API key so `pnpm selfcheck` can prove retrieval fired offline. When `TENON_EMBED_URL` is set, `pnpm selfcheck` reports `hybrid-embed`.

## What retrieval is allowed to touch

- Identity-ladder **fuzzy** proposals (still never auto-matched)
- **Rationale wording** on `needs_human_match` (chunk locators appended)
- Optional model-share draft of a one-sentence disposition rationale (`src/tenants/rcm/model-share.ts`)

Predicates, frequency-as-attribute-diff, committee counts, and accept/reject remain TypeScript.

## Chunk ids

Each evidence cell is `spanHash(copy|sheet|row|column|field|text)` — 16 hex chars — cited as `IA RCM Controls!D12#a1b2c3…`. If a cited id does not resolve in the per-run index, the flag is quarantined.

## How to run

```bash
pnpm test          # includes tests/rcm-retrieve.test.ts
pnpm selfcheck     # retrieval fired / cited chunk ids / embed path skipped or live
```

With a key (optional):

```
TENON_EMBED_URL=https://api.openai.com/v1/embeddings
TENON_EMBED_API_KEY=sk-...
# or ANTHROPIC_API_KEY for rationale-draft complete() only — still not embeddings
```
