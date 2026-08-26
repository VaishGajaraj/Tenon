/**
 * Thin provider adapter. Deliberately NOT a framework (see SPEC §ADR-2):
 * one function, JSON in / JSON out, mock mode when no key is present.
 */

export interface CompletionRequest {
  system: string;
  user: string;
  model: string;
  maxTokens?: number;
}

export interface CompletionResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number; ms: number } | null;
  mocked: boolean;
}

export function hasRealModel(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function complete(req: CompletionRequest): Promise<CompletionResult> {
  if (!hasRealModel()) {
    return { text: "", usage: null, mocked: true };
  }
  const started = Date.now();
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const resp = await client.messages.create({
    model: req.model,
    max_tokens: req.maxTokens ?? 4096,
    system: req.system,
    messages: [{ role: "user", content: req.user }],
  });
  const text = resp.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return {
    text,
    usage: {
      inputTokens: resp.usage.input_tokens,
      outputTokens: resp.usage.output_tokens,
      ms: Date.now() - started,
    },
    mocked: false,
  };
}

/** Extract the first JSON object from a model response. */
export function parseJsonBlock(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in model output");
  }
  return JSON.parse(text.slice(start, end + 1));
}

export const DRAFT_MODEL = () => process.env.TENON_DRAFT_MODEL || "claude-sonnet-4-5";
export const REFLECT_MODEL = () => process.env.TENON_REFLECT_MODEL || "claude-opus-4-5";
