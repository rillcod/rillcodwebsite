import OpenAI from 'openai';
import { geminiGenerateText, hasGeminiKey } from '@/lib/gemini/client';
import { groqGenerateText, hasGroqKey } from '@/lib/ai/groq-free';
import { cerebrasGenerateText, hasCerebrasKey } from '@/lib/ai/cerebras-free';
import { cloudflareGenerateText, hasCloudflareAi } from '@/lib/ai/cloudflare-ai';
import { modelQueueFor } from '@/lib/ai/model-policy';
import { FREE_FALLBACK_MODELS } from '@/lib/ai/openrouter';

/**
 * A plain system+user text call that survives a Gemini outage.
 *
 * `geminiGenerateText` is Gemini and nothing else — the fall-through to
 * OpenRouter has always lived a layer above it, in generate-core or in each AI
 * route. Anything that called the Gemini client directly therefore had no
 * fallback at all, and simply stopped working the moment the free daily quota
 * ran out.
 *
 * Curriculum repair was one of those callers, which is the worst place for it:
 * a 24-week solidify is a long generation, so it is the first thing to hit the
 * quota and the last thing you want to lose. OPENROUTER_API_KEY was configured
 * and sitting unused while repair reported "The AI service did not respond".
 *
 * Free-first is preserved exactly as the rest of the app does it — direct
 * Gemini before anything billable, then only `:free` OpenRouter variants
 * through modelQueueFor, which drops retired ids and puts healthy models first.
 *
 * This adds a fallback where there was none; it does not replace the per-route
 * OpenRouter clients. Those work, and rewriting them would be churn for its own
 * sake. Use this from any non-route caller that needs plain system+user text.
 */

const openrouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
});

export type FreeFirstResult = { text: string; model: string } | null;

export type FreeFirstOptions = {
  /** Long structured documents need room; truncation reads as invalid JSON downstream. */
  maxOutputTokens?: number;
  temperature?: number;
  minLength?: number;
  /** Prefer sub-second LPU inference (Groq / Cerebras) before Gemini for snappy interactive analysis. */
  fastFirst?: boolean;
};

/**
 * Try free zero-cost AI tiers (Gemini, Groq, Cerebras, Cloudflare, OpenRouter :free)
 * and report which one answered.
 */
export async function generateTextFreeFirst(
  system: string,
  user: string,
  jsonMode?: boolean,
  options: FreeFirstOptions = {},
): Promise<FreeFirstResult> {
  const minLength = options.minLength ?? 20;

  const tryGemini = async (): Promise<FreeFirstResult> => {
    if (!hasGeminiKey()) return null;
    const result = await geminiGenerateText(system, user, Boolean(jsonMode)).catch(() => null);
    const text = result?.text?.trim() ?? '';
    return text.length > minLength ? { text, model: result!.model } : null;
  };

  const tryGroq = async (): Promise<FreeFirstResult> => {
    if (!hasGroqKey()) return null;
    const groqResult = await groqGenerateText(system, user, {
      json: Boolean(jsonMode),
      maxTokens: options.maxOutputTokens ?? 8192,
      temperature: options.temperature ?? 0.3,
    }).catch(() => null);
    const groqText = groqResult?.text?.trim() ?? '';
    return groqText.length > minLength ? { text: groqText, model: groqResult!.model } : null;
  };

  const tryCerebras = async (): Promise<FreeFirstResult> => {
    if (!hasCerebrasKey()) return null;
    const cbResult = await cerebrasGenerateText(system, user, {
      json: Boolean(jsonMode),
      maxTokens: options.maxOutputTokens ?? 8192,
      temperature: options.temperature ?? 0.3,
    }).catch(() => null);
    const cbText = cbResult?.text?.trim() ?? '';
    return cbText.length > minLength ? { text: cbText, model: cbResult!.model } : null;
  };

  const tryCloudflare = async (): Promise<FreeFirstResult> => {
    if (!hasCloudflareAi()) return null;
    const cfResult = await cloudflareGenerateText(system, user, {
      json: Boolean(jsonMode),
      maxTokens: options.maxOutputTokens ?? 8192,
      temperature: options.temperature ?? 0.3,
    }).catch(() => null);
    const cfText = cfResult?.text?.trim() ?? '';
    return cfText.length > minLength ? { text: cfText, model: cfResult!.model } : null;
  };

  const orderedTiers = options.fastFirst
    ? [tryGroq, tryCerebras, tryGemini, tryCloudflare]
    : [tryGemini, tryGroq, tryCerebras, tryCloudflare];

  for (const runTier of orderedTiers) {
    const hit = await runTier();
    if (hit) return hit;
  }

  if (!process.env.OPENROUTER_API_KEY) return null;

  const queue = await modelQueueFor({ needsJson: Boolean(jsonMode), intelligence: 'high' })
    .catch(() => [...FREE_FALLBACK_MODELS]);

  for (const model of queue) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await openrouter.chat.completions.create(
        {
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxOutputTokens ?? 32_000,
          ...(jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
        },
        { signal: controller.signal },
      );
      const text = response.choices?.[0]?.message?.content?.trim() ?? '';
      if (text.length > minLength) return { text, model };
    } catch {
      // Try the next free model. A dead or rate-limited one must not end the run.
    } finally {
      clearTimeout(timer);
    }
  }

  return null;
}
