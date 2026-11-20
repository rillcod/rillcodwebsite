/**
 * Groq Free Tier — ultra-fast (300–700 tok/s) OpenAI-compatible inference.
 *
 * Completely inert when GROQ_API_KEY / GROQ_API_KEYS are not configured.
 * Supports key-pool rotation (GROQ_API_KEY, GROQ_API_KEY_2..5, or comma-separated GROQ_API_KEYS)
 * to multiply free daily token headroom across keys.
 */

import { healthiestFirst, recordModelFailure, recordModelSuccess } from './model-health';

const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export const GROQ_FREE_MODELS = [
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'qwen/qwen3-32b',
  'llama-3.1-8b-instant',
] as const;

function loadGroqKeys(): string[] {
  const raw = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4,
    process.env.GROQ_API_KEY_5,
    ...(process.env.GROQ_API_KEYS ?? '').split(','),
  ];
  return Array.from(new Set(raw.map((k) => k?.trim()).filter((k): k is string => Boolean(k))));
}

let groqKeyCursor = 0;

function rotatedGroqKeys(): string[] {
  const keys = loadGroqKeys();
  if (keys.length <= 1) return keys;
  const start = groqKeyCursor++ % keys.length;
  return [...keys.slice(start), ...keys.slice(0, start)];
}

export function hasGroqKey(): boolean {
  return loadGroqKeys().length > 0;
}

export async function groqGenerateText(
  system: string,
  user: string,
  options: {
    json?: boolean;
    maxTokens?: number;
    temperature?: number;
    signal?: AbortSignal;
  } = {},
): Promise<{ text: string; model: string } | null> {
  const keys = rotatedGroqKeys();
  if (keys.length === 0) return null;

  const models = healthiestFirst([...GROQ_FREE_MODELS], (m) => `groq:${m}`);

  for (const model of models) {
    if (options.signal?.aborted) return null;

    for (const apiKey of keys) {
      if (options.signal?.aborted) return null;
      try {
        const res = await fetch(GROQ_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            max_tokens: Math.min(options.maxTokens ?? 4096, 8192),
            temperature: options.temperature ?? 0.3,
            ...(options.json ? { response_format: { type: 'json_object' } } : {}),
          }),
          signal: options.signal,
        });

        if (res.status === 401 || res.status === 403) {
          // Bad key — try next key
          continue;
        }
        if (res.status === 429) {
          // Rate limit on this key — try next key before demoting the model
          continue;
        }
        if (!res.ok) {
          recordModelFailure(`groq:${model}`, res.status);
          break;
        }

        const data = await res.json().catch(() => null);
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content === 'string' && content.trim()) {
          recordModelSuccess(`groq:${model}`);
          return { text: content.trim(), model: `groq/${model}` };
        }
        recordModelFailure(`groq:${model}`, 502);
        break;
      } catch {
        recordModelFailure(`groq:${model}`, 503);
        break;
      }
    }
  }

  return null;
}
