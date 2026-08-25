/**
 * Hugging Face as the last text tier, and as the speech-to-text provider.
 *
 * HUGGINGFACE_API_KEY has been configured on this project since July 2025 and
 * was wired to nothing: the only line that ever read it was a guard in the STT
 * route that checked this key and then spent OPENROUTER_API_KEY instead. The
 * token is valid and its router answers, so this connects it to the central
 * policy rather than leaving a live credential idle.
 *
 * ── The one fact that decides where it sits ──────────────────────────────────
 *
 * Nothing on the HF router is free. All 131 live text models are billed per
 * token — there is no `:free` equivalent. This app is deliberately free-first
 * (direct Gemini, then `:free` OpenRouter), so HF must never be reached while a
 * free option remains, and must be absent entirely when AI_FREE_MODELS_ONLY is
 * set. It is a floor under the paid tier, not a new default.
 *
 * ── Why a prefix ─────────────────────────────────────────────────────────────
 *
 * modelQueueFor returns bare id strings that callers hand to the OpenRouter
 * endpoint. An HF id dropped into that list unprefixed would be sent to
 * OpenRouter and 404, and would then be recorded as an unhealthy model — an id
 * that works, demoted for failing at the wrong address. The `hf:` prefix keeps
 * routing unambiguous for every existing caller.
 */

export const HF_PREFIX = 'hf:';

/** OpenAI-compatible chat completions. Same body shape as OpenRouter. */
export const HF_CHAT_URL = 'https://router.huggingface.co/v1/chat/completions';

export function hasHuggingFaceKey(): boolean {
  return Boolean(process.env.HUGGINGFACE_API_KEY);
}

export function isHuggingFaceModel(modelId: string): boolean {
  return modelId.startsWith(HF_PREFIX);
}

/** `hf:openai/gpt-oss-120b` → `openai/gpt-oss-120b` (the id the router wants). */
export function stripHuggingFacePrefix(modelId: string): string {
  return modelId.startsWith(HF_PREFIX) ? modelId.slice(HF_PREFIX.length) : modelId;
}

export type HuggingFaceModel = {
  /** Prefixed id, as it appears in a queue. */
  id: string;
  contextTokens: number;
  supportsJson: boolean;
  /** USD per million input tokens, for ordering cheap-first within a tier. */
  inputPricePerM: number;
  /** Observed output speed, tokens/sec. */
  throughput: number;
};

/**
 * Curated from the live router catalogue, measured rather than assumed:
 * context_length, supports_structured_output, first_token_latency_ms and
 * throughput all come from HF's own model metadata.
 *
 * Ordering is "cheap and fast enough" before "enormous window", because the
 * expensive generations in this app (a lesson, a term of curriculum) are long
 * *outputs* from short prompts, not long inputs. modelQueueFor still filters on
 * contextTokensNeeded, so the million-token entries are there for the rare
 * caller that genuinely needs one and are skipped by everything else.
 *
 * Every entry supports structured output, because JSON is what this app asks
 * for and a model that cannot promise it is where malformed lessons came from.
 */
export const HF_MODELS: HuggingFaceModel[] = [
  // Fast, cheap, 131k. The workhorse: ~800-1000 tok/s at ~200ms to first token.
  { id: 'hf:openai/gpt-oss-120b', contextTokens: 131_072, supportsJson: true, inputPricePerM: 0.35, throughput: 1057 },
  { id: 'hf:openai/gpt-oss-20b', contextTokens: 131_072, supportsJson: true, inputPricePerM: 0.10, throughput: 809 },
  // Long context without the long-context price.
  { id: 'hf:Qwen/Qwen3-Next-80B-A3B-Instruct', contextTokens: 262_144, supportsJson: true, inputPricePerM: 0.09, throughput: 123 },
  { id: 'hf:meta-llama/Llama-4-Scout-17B-16E-Instruct', contextTokens: 890_000, supportsJson: true, inputPricePerM: 0.09, throughput: 73 },
  // Million-token windows, for the rare job that needs one.
  { id: 'hf:deepseek-ai/DeepSeek-V4-Flash', contextTokens: 1_048_576, supportsJson: true, inputPricePerM: 0.09, throughput: 28 },
  { id: 'hf:thinkingmachines/Inkling-Small', contextTokens: 1_048_576, supportsJson: true, inputPricePerM: 0.50, throughput: 187 },
];

/**
 * The HF tail of a model queue, or nothing at all.
 *
 * Returns [] — not a fallback list — whenever HF must not be used: no key, or
 * free-models-only. A caller appending this to a queue therefore cannot
 * accidentally introduce billable inference into a run that asked to stay free.
 */
export function huggingFaceQueue(options: {
  needsJson?: boolean;
  contextTokensNeeded?: number;
} = {}): string[] {
  if (!hasHuggingFaceKey()) return [];
  if (process.env.AI_FREE_MODELS_ONLY === 'true') return [];

  return HF_MODELS.filter((model) => {
    if (options.needsJson && !model.supportsJson) return false;
    if (options.contextTokensNeeded && model.contextTokens < options.contextTokensNeeded) return false;
    return true;
  }).map((model) => model.id);
}

/**
 * Speech to text, via Whisper on the HF router.
 *
 * The STT route previously posted the audio to OpenRouter as a chat message
 * with the clip base64'd into an `image_url` field, asking a text model to
 * "transcribe this". That worked by accident of multimodal tolerance. Whisper
 * is the model built for the job, openai/whisper-large-v3 has five live
 * providers on this token, and the endpoint takes the audio bytes directly.
 *
 * Returns null rather than throwing so the caller can fall back to the old path
 * instead of failing the request — this is an upgrade, not a replacement that
 * takes transcription down with it if HF is unavailable.
 */
export async function huggingFaceTranscribe(
  audio: ArrayBuffer,
  contentType: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const key = process.env.HUGGINGFACE_API_KEY;
  if (!key) return null;

  try {
    const response = await fetch(
      'https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': contentType || 'audio/mpeg',
        },
        body: audio,
        signal,
      },
    );

    if (!response.ok) {
      console.warn(`[huggingface] whisper ${response.status}`);
      return null;
    }

    const data = await response.json().catch(() => null);
    const text = typeof data?.text === 'string' ? data.text.trim() : '';
    return text || null;
  } catch (err) {
    console.warn('[huggingface] whisper request failed:', (err as Error)?.message);
    return null;
  }
}
