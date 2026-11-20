/**
 * Cerebras Free Tier — ultra-fast (~2,000 tok/s) OpenAI-compatible inference.
 *
 * Completely inert when CEREBRAS_API_KEY / CEREBRAS_API_KEYS are not configured.
 * Supports key-pool rotation to multiply free daily token quota across keys.
 */

import { healthiestFirst, recordModelFailure, recordModelSuccess } from './model-health';

const CEREBRAS_ENDPOINT = 'https://api.cerebras.ai/v1/chat/completions';

export const CEREBRAS_FREE_MODELS = [
  'llama-3.3-70b',
  'qwen-3-32b',
  'llama3.1-8b',
] as const;

function loadCerebrasKeys(): string[] {
  const raw = [
    process.env.CEREBRAS_API_KEY,
    process.env.CEREBRAS_API_KEY_2,
    process.env.CEREBRAS_API_KEY_3,
    ...(process.env.CEREBRAS_API_KEYS ?? '').split(','),
  ];
  return Array.from(new Set(raw.map((k) => k?.trim()).filter((k): k is string => Boolean(k))));
}

let cerebrasCursor = 0;

function rotatedCerebrasKeys(): string[] {
  const keys = loadCerebrasKeys();
  if (keys.length <= 1) return keys;
  const start = cerebrasCursor++ % keys.length;
  return [...keys.slice(start), ...keys.slice(0, start)];
}

export function hasCerebrasKey(): boolean {
  return loadCerebrasKeys().length > 0;
}

export async function cerebrasGenerateText(
  system: string,
  user: string,
  options: {
    json?: boolean;
    maxTokens?: number;
    temperature?: number;
    signal?: AbortSignal;
  } = {},
): Promise<{ text: string; model: string } | null> {
  const keys = rotatedCerebrasKeys();
  if (keys.length === 0) return null;

  const models = healthiestFirst([...CEREBRAS_FREE_MODELS], (m) => `cerebras:${m}`);

  for (const model of models) {
    if (options.signal?.aborted) return null;

    for (const apiKey of keys) {
      if (options.signal?.aborted) return null;
      try {
        const res = await fetch(CEREBRAS_ENDPOINT, {
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
            max_completion_tokens: Math.min(options.maxTokens ?? 4096, 8192),
            temperature: options.temperature ?? 0.3,
            ...(options.json ? { response_format: { type: 'json_object' } } : {}),
          }),
          signal: options.signal,
        });

        if (res.status === 401 || res.status === 403 || res.status === 429) {
          continue;
        }
        if (!res.ok) {
          recordModelFailure(`cerebras:${model}`, res.status);
          break;
        }

        const data = await res.json().catch(() => null);
        const content = data?.choices?.[0]?.message?.content;
        if (typeof content === 'string' && content.trim()) {
          recordModelSuccess(`cerebras:${model}`);
          return { text: content.trim(), model: `cerebras/${model}` };
        }
        recordModelFailure(`cerebras:${model}`, 502);
        break;
      } catch {
        recordModelFailure(`cerebras:${model}`, 503);
        break;
      }
    }
  }

  return null;
}
