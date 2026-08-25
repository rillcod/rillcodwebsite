import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HF_MODELS,
  huggingFaceQueue,
  isHuggingFaceModel,
  stripHuggingFacePrefix,
} from './huggingface';

/**
 * Hugging Face is the only billable-by-default tier in this engine: nothing on
 * its router is free. These tests pin the two properties that keep that safe —
 * it never appears without a key, and it never appears in a free-only run.
 */

const KEYS = ['HUGGINGFACE_API_KEY', 'AI_FREE_MODELS_ONLY'] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
});

describe('cost safety', () => {
  it('offers nothing at all without a key', () => {
    expect(huggingFaceQueue()).toEqual([]);
  });

  it('offers nothing when the run asked to stay free', () => {
    process.env.HUGGINGFACE_API_KEY = 'hf_test';
    process.env.AI_FREE_MODELS_ONLY = 'true';
    // Returning a fallback list here instead of [] is what would quietly bill a
    // run that explicitly opted out of paid inference.
    expect(huggingFaceQueue()).toEqual([]);
  });

  it('offers models once a key is present', () => {
    process.env.HUGGINGFACE_API_KEY = 'hf_test';
    expect(huggingFaceQueue().length).toBeGreaterThan(0);
  });
});

describe('routing', () => {
  it('marks its own ids and leaves others alone', () => {
    expect(isHuggingFaceModel('hf:openai/gpt-oss-120b')).toBe(true);
    expect(isHuggingFaceModel('openai/gpt-oss-20b:free')).toBe(false);
    expect(isHuggingFaceModel('google/gemma-4-31b-it:free')).toBe(false);
  });

  it('strips the prefix to the id the router expects', () => {
    expect(stripHuggingFacePrefix('hf:openai/gpt-oss-120b')).toBe('openai/gpt-oss-120b');
    // Not ours: must pass through untouched, or an OpenRouter id would be mangled.
    expect(stripHuggingFacePrefix('meta-llama/llama-3.1-8b-instruct:free')).toBe(
      'meta-llama/llama-3.1-8b-instruct:free',
    );
  });

  it('every catalogue entry is prefixed, so none can be sent to OpenRouter', () => {
    for (const model of HF_MODELS) {
      expect(isHuggingFaceModel(model.id), `${model.id} is unprefixed`).toBe(true);
    }
  });
});

describe('selection', () => {
  beforeEach(() => {
    process.env.HUGGINGFACE_API_KEY = 'hf_test';
  });

  it('drops models whose window is too small for the input', () => {
    const huge = huggingFaceQueue({ contextTokensNeeded: 900_000 });
    expect(huge.length).toBeGreaterThan(0);
    for (const id of huge) {
      const model = HF_MODELS.find((m) => m.id === id)!;
      expect(model.contextTokens).toBeGreaterThanOrEqual(900_000);
    }
    // And a window nothing offers yields nothing, rather than a bad suggestion.
    expect(huggingFaceQueue({ contextTokensNeeded: 5_000_000 })).toEqual([]);
  });

  it('only offers JSON-capable models for a JSON task', () => {
    for (const id of huggingFaceQueue({ needsJson: true })) {
      expect(HF_MODELS.find((m) => m.id === id)!.supportsJson).toBe(true);
    }
  });

  it('leads with the fast workhorse rather than the biggest window', () => {
    // The expensive generations here are long outputs from short prompts, so
    // throughput matters more than a million-token context by default.
    expect(huggingFaceQueue()[0]).toBe('hf:openai/gpt-oss-120b');
  });
});
