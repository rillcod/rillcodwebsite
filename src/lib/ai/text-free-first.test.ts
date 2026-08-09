import { describe, expect, it } from 'vitest';
import { FREE_FALLBACK_MODELS } from './openrouter';

describe('free-first text fallback', () => {
  it('carries no hardcoded model queue of its own', async () => {
    // The rotted-list trap, guarded rather than remembered. Every hardcoded
    // free queue copied around this codebase had decayed to ids that all 404,
    // which turned "free first" into "404 first, then bill the paid model
    // behind it". This helper must resolve models through the live catalogue
    // (modelQueueFor) and fall back only to the one maintained list.
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/lib/ai/text-free-first.ts', 'utf8'));

    const inlineFreeIds = source.match(/'[a-z0-9-]+\/[a-z0-9.\-]+:free'/gi) ?? [];
    expect(inlineFreeIds).toEqual([]);
    expect(source).toContain('modelQueueFor');
    expect(source).toContain('FREE_FALLBACK_MODELS');
  });

  it('the maintained fallback list is all free variants', () => {
    // A paid id slipping in here would spend real credit during a Gemini outage,
    // which is precisely the moment nobody is watching the bill.
    for (const model of FREE_FALLBACK_MODELS) {
      expect(model.endsWith(':free')).toBe(true);
    }
  });
});
