import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { modelQueueFor } from './model-policy';
import { resetFreeModelCache } from './openrouter';
import { isHuggingFaceModel } from './huggingface';

/**
 * The regression this guards.
 *
 * Adding Hugging Face gave this engine its first tier that is billable by
 * default — nothing on the HF router is free. Free-first is the whole design:
 * direct Gemini, then `:free` OpenRouter, and only then anything that costs
 * money. If an HF id ever sorted above a free one, every generation in the app
 * would quietly start spending, and nothing else in the suite would notice.
 *
 * So this asserts position, not just presence.
 */

vi.mock('./model-catalogue-store', () => ({
  readStoredFreeModels: vi.fn().mockResolvedValue(null),
  writeStoredFreeModels: vi.fn(),
}));

const FREE_CATALOGUE = {
  ok: true,
  json: async () => ({
    data: [
      {
        id: 'vendor/free-big:free',
        context_length: 1_000_000,
        architecture: { input_modalities: ['text'], output_modalities: ['text'] },
        supported_parameters: ['response_format', 'tools'],
      },
      {
        id: 'vendor/free-small:free',
        context_length: 64_000,
        architecture: { input_modalities: ['text'], output_modalities: ['text'] },
        supported_parameters: ['response_format', 'tools'],
      },
    ],
  }),
} as unknown as Response;

const KEYS = ['HUGGINGFACE_API_KEY', 'AI_FREE_MODELS_ONLY'] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  resetFreeModelCache();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(FREE_CATALOGUE);
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
  vi.restoreAllMocks();
  resetFreeModelCache();
});

describe('Hugging Face position in the central queue', () => {
  it('never precedes a free model', async () => {
    process.env.HUGGINGFACE_API_KEY = 'hf_test';
    const queue = await modelQueueFor({ needsJson: true });

    const firstHf = queue.findIndex(isHuggingFaceModel);
    const lastFree = queue.map((id) => id.endsWith(':free')).lastIndexOf(true);

    expect(firstHf, 'Hugging Face should be in the queue when a key is set').toBeGreaterThan(-1);
    expect(lastFree, 'free models should still be in the queue').toBeGreaterThan(-1);
    expect(firstHf).toBeGreaterThan(lastFree);
  });

  it('is absent entirely with no key — the queue is what it always was', async () => {
    const queue = await modelQueueFor({ needsJson: true });
    expect(queue.some(isHuggingFaceModel)).toBe(false);
    expect(queue.length).toBeGreaterThan(0);
  });

  it('is absent in a free-only run even with a key', async () => {
    process.env.HUGGINGFACE_API_KEY = 'hf_test';
    process.env.AI_FREE_MODELS_ONLY = 'true';
    const queue = await modelQueueFor({ needsJson: true });
    expect(queue.some(isHuggingFaceModel)).toBe(false);
  });

  it('does not displace an explicit paid preference from ahead of it', async () => {
    process.env.HUGGINGFACE_API_KEY = 'hf_test';
    const queue = await modelQueueFor({ needsJson: true, prefer: ['vendor/free-small:free'] });

    // The route's own free pick still leads; HF is still behind everything free.
    expect(queue[0]).toBe('vendor/free-small:free');
    expect(queue.findIndex(isHuggingFaceModel)).toBeGreaterThan(0);
  });
});
