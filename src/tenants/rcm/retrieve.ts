import { createHash } from "node:crypto";
import type { CanonicalControl } from "./schema";
import type { FactRow } from "./schema";
import type { ColumnMap } from "./ingest";
import { IA_MAP, SOX_MAP } from "./ingest";

/**
 * Per-run retrieval over control-library / imported-row / evidence-cell chunks.
 *
 * SOTA-inspired: hybrid BM25 + dense embeddings with citations, not a dump
 * into the system prompt (see docs/RETRIEVAL.md).
 *
 * Shipped: BM25-lite (tf-idf cosine) + hashed character 3-gram vectors so the
 * hybrid path is deterministic in MOCK. Optional OpenAI-compatible embeddings
 * via TENON_EMBED_URL when a key is present — never required for the demo.
 */

export interface EvidenceChunk {
  chunkId: string;
  copy: string;
  sheet: string;
  row: number;
  column: string;
  field: string;
  text: string;
  displayId: string;
  recordId: string;
}

export interface RetrievalHit {
  chunk: EvidenceChunk;
  score: number;
  lexical: number;
  dense: number;
}

export type RetrievalBackend = "hybrid-hash" | "hybrid-embed";

export interface RetrievalReport {
  fired: boolean;
  backend: RetrievalBackend;
  chunkCount: number;
  queries: number;
  hits: number;
  citedChunkIds: string[];
}

const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "are", "was", "were",
  "has", "have", "control", "bank", "each", "into", "over",
]);

export function spanHash(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

const DIM = 128;

function hashedTrigramVector(text: string): Float64Array {
  const v = new Float64Array(DIM);
  const s = `  ${text.toLowerCase()}  `;
  for (let i = 0; i < s.length - 2; i++) {
    const gram = s.slice(i, i + 3);
    const h = createHash("sha256").update(gram).digest();
    const bucket = h[0]! % DIM;
    const sign = h[1]! & 1 ? 1 : -1;
    v[bucket] += sign;
  }
  let n = 0;
  for (let i = 0; i < DIM; i++) n += v[i]! * v[i]!;
  const norm = Math.sqrt(n) || 1;
  for (let i = 0; i < DIM; i++) v[i]! /= norm;
  return v;
}

function cosine(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return (s + 1) / 2; // 0..1
}

export interface ChunkIndex {
  chunks: EvidenceChunk[];
  df: Map<string, number>;
  tf: Map<string, Map<string, number>>;
  dense: Map<string, Float64Array>;
  tfidf: Map<string, Map<string, number>>;
}

function tfidfVectors(chunks: EvidenceChunk[], df: Map<string, number>, tf: Map<string, Map<string, number>>) {
  const N = chunks.length || 1;
  const vecs = new Map<string, Map<string, number>>();
  for (const c of chunks) {
    const termTf = tf.get(c.chunkId) ?? new Map();
    const weights = new Map<string, number>();
    let norm = 0;
    for (const [term, f] of termTf) {
      const idf = Math.log((N + 1) / ((df.get(term) ?? 0) + 1)) + 1;
      const w = (1 + Math.log(f)) * idf;
      weights.set(term, w);
      norm += w * w;
    }
    const scale = Math.sqrt(norm) || 1;
    for (const [t, w] of weights) weights.set(t, w / scale);
    vecs.set(c.chunkId, weights);
  }
  return vecs;
}

export function buildIndex(chunks: EvidenceChunk[]): ChunkIndex {
  const df = new Map<string, number>();
  const tf = new Map<string, Map<string, number>>();
  const dense = new Map<string, Float64Array>();
  for (const c of chunks) {
    const terms = tokenize(c.text);
    const counts = new Map<string, number>();
    const seen = new Set<string>();
    for (const t of terms) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
      seen.add(t);
    }
    tf.set(c.chunkId, counts);
    for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
    dense.set(c.chunkId, hashedTrigramVector(c.text));
  }
  return { chunks, df, tf, dense, tfidf: tfidfVectors(chunks, df, tf) };
}

function lexicalScore(queryTerms: string[], doc: Map<string, number>, df: Map<string, number>, nDocs: number): number {
  const qtf = new Map<string, number>();
  for (const t of queryTerms) qtf.set(t, (qtf.get(t) ?? 0) + 1);
  let qnorm = 0;
  const qw = new Map<string, number>();
  for (const [term, f] of qtf) {
    const idf = Math.log((nDocs + 1) / ((df.get(term) ?? 0) + 1)) + 1;
    const w = (1 + Math.log(f)) * idf;
    qw.set(term, w);
    qnorm += w * w;
  }
  const qscale = Math.sqrt(qnorm) || 1;
  let dot = 0;
  for (const [term, w] of qw) {
    const dw = doc.get(term);
    if (dw) dot += (w / qscale) * dw;
  }
  return Math.max(0, Math.min(1, dot));
}

export function retrieve(query: string, index: ChunkIndex, k = 5): RetrievalHit[] {
  const qTerms = tokenize(query);
  const qDense = hashedTrigramVector(query);
  const hits: RetrievalHit[] = [];
  for (const chunk of index.chunks) {
    const lex = lexicalScore(qTerms, index.tfidf.get(chunk.chunkId) ?? new Map(), index.df, index.chunks.length);
    const den = cosine(qDense, index.dense.get(chunk.chunkId) ?? new Float64Array(DIM));
    const score = 0.6 * lex + 0.4 * den;
    hits.push({ chunk, score, lexical: lex, dense: den });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, k);
}

function cellColumn(row: FactRow, header: string): string {
  const idx = Object.keys(row.columns).indexOf(header);
  if (idx < 0) return header;
  let n = idx + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function chunkFor(
  row: FactRow,
  field: string,
  header: string,
  text: string,
): EvidenceChunk | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const column = cellColumn(row, header);
  const chunkId = spanHash([row.copy, row.sheet, String(row.excelRow), column, field, trimmed]);
  return {
    chunkId,
    copy: row.copy,
    sheet: row.sheet,
    row: row.excelRow,
    column,
    field,
    text: trimmed,
    displayId: row.displayId,
    recordId: row.recordId,
  };
}

export function chunksFromRows(rows: FactRow[], map: ColumnMap): EvidenceChunk[] {
  const out: EvidenceChunk[] = [];
  for (const row of rows) {
    const fields: [string, string, string][] = [
      ["title", map.title, row.title],
      ["description", map.description, row.description],
      ["owner", map.owner, row.owner],
      ["frequency", map.frequency, row.frequency],
    ];
    for (const [field, header, text] of fields) {
      const c = chunkFor(row, field, header, text);
      if (c) out.push(c);
    }
  }
  return out;
}

export function chunksFromLibrary(controls: CanonicalControl[]): EvidenceChunk[] {
  return controls.flatMap((c) => {
    const text = `${c.title}\n${c.description}`;
    const chunkId = spanHash(["library", c.canonicalId, text]);
    return [
      {
        chunkId,
        copy: "canonical-library",
        sheet: "Library",
        row: 0,
        column: "B",
        field: "description",
        text,
        displayId: c.displayId,
        recordId: c.canonicalId,
      },
    ];
  });
}

export function indexFactRows(ia: FactRow[], sox: FactRow[], library?: CanonicalControl[]): ChunkIndex {
  const chunks = [
    ...chunksFromRows(ia, IA_MAP),
    ...chunksFromRows(sox, SOX_MAP),
    ...(library ? chunksFromLibrary(library) : []),
  ];
  return buildIndex(chunks);
}

export function rowPairScore(ia: FactRow, sox: FactRow, index: ChunkIndex): number {
  const query = `${ia.title} ${ia.description}`;
  const soxChunks = index.chunks.filter((c) => c.recordId === sox.recordId && c.displayId === sox.displayId);
  if (soxChunks.length === 0) return 0;
  const sub = buildIndex(soxChunks);
  const hits = retrieve(query, sub, 3);
  return hits[0]?.score ?? 0;
}

export function citeLocator(chunk: EvidenceChunk): string {
  return `${chunk.copy} ${chunk.sheet}!${chunk.column}${chunk.row}#${chunk.chunkId}`;
}

export function lookupChunk(index: ChunkIndex, chunkId: string): EvidenceChunk | undefined {
  return index.chunks.find((c) => c.chunkId === chunkId);
}

export function hasEmbedEndpoint(): boolean {
  return Boolean(process.env.TENON_EMBED_URL);
}

/**
 * Optional dense embeddings behind an OpenAI-compatible endpoint.
 * Not used on the MOCK demo path. Failures fall back to hashed vectors.
 */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const url = process.env.TENON_EMBED_URL;
  if (!url) return null;
  const key = process.env.TENON_EMBED_API_KEY || process.env.OPENAI_API_KEY || "";
  const model = process.env.TENON_EMBED_MODEL || "text-embedding-3-small";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({ input: texts, model }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: { embedding: number[] }[] };
  if (!body.data || body.data.length !== texts.length) return null;
  return body.data.map((d) => d.embedding);
}

export function backendForThisRun(): RetrievalBackend {
  return hasEmbedEndpoint() ? "hybrid-embed" : "hybrid-hash";
}
