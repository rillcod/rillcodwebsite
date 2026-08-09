import OpenAI from 'openai';
import { geminiGenerateText, hasGeminiKey } from '@/lib/gemini/client';
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
};

/**
 * Try Gemini, then free OpenRouter models, and report which one answered.
 *
 * Returns null only when every option failed, so a caller can tell "the AI is
 * unavailable" apart from "the AI produced something unusable" — curriculum
 * repair keeps the original document in both cases, but says different things.
 */
export async function generateTextFreeFirst(
  system: string,
  user: string,
  jsonMode?: boolean,
  options: FreeFirstOptions = {},
): Promise<FreeFirstResult> {
  const minLength = options.minLength ?? 20;

  if (hasGeminiKey()) {
    // geminiGenerateText takes `boolean | GenerateTextOptions`, so the boolean
    // is a supported form rather than something needing a cast.
    const result = await geminiGenerateText(system, user, Boolean(jsonMode)).catch(() => null);
    const text = result?.text?.trim() ?? '';
    if (text.length > minLength) return { text, model: result!.model };
  }

  if (!process.env.OPENROUTER_API_KEY) return null;

  // No `prefer` list of our own, for a reason worth stating precisely.
  //
  // modelQueueFor filters every preference — free and paid — against the live
  // OpenRouter catalogue, so a retired id in a prefer list is dropped rather
  // than called. That is why the stale queues elsewhere in this codebase are
  // inert rather than broken, and why the ai-model-drift cron treats a
  // retirement as a cost issue rather than an outage.
  //
  // A prefer list here would therefore buy nothing but future rot: checked at
  // the time of writing, all six hardcoded ':free' ids across the AI routes had
  // been retired. FREE_FALLBACK_MODELS is the one maintained list, and is used
  // only when the catalogue itself cannot be reached.
  const queue = await modelQueueFor({ needsJson: Boolean(jsonMode) })
    .catch(() => [...FREE_FALLBACK_MODELS]);

  for (const model of queue) {
    try {
      const response = await openrouter.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: options.temperature ?? 0.3,
        // A whole curriculum is the payload here, not a paragraph. The default
        // would truncate mid-JSON and be discarded as unparseable.
        max_tokens: options.maxOutputTokens ?? 32_000,
        ...(jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
      });
      const text = response.choices?.[0]?.message?.content?.trim() ?? '';
      if (text.length > minLength) return { text, model };
    } catch {
      // Try the next free model. A dead or rate-limited one must not end the run.
    }
  }

  return null;
}
