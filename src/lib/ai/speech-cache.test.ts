import { describe, expect, it } from 'vitest';
import { speechCacheKey } from './speech-cache';

/**
 * The cache key IS the economics.
 *
 * 10,000 Neurons a day is shared across every model, so what decides whether a
 * class can replay a lesson freely is not the cost of one generation — it is
 * how often the same sentence gets generated. These assertions pin the two
 * properties that make repeated listening free: identical text always lands on
 * the same object, and different text never collides onto one.
 */

const VOICE = '@cf/deepgram/aura-2-en';

describe('same passage, same object', () => {
  it('is stable across calls, so a whole class costs one generation', () => {
    const text = 'The water cycle has four stages.';
    expect(speechCacheKey(text, VOICE)).toBe(speechCacheKey(text, VOICE));
  });

  it('ignores incidental whitespace rather than paying twice for one sentence', () => {
    // Lesson text arrives from editors, markdown and copy-paste; a stray double
    // space or a newline must not fork the cache.
    const a = 'The water cycle has four stages.';
    const b = '  The water cycle   has four\nstages.  ';
    expect(speechCacheKey(b, VOICE)).toBe(speechCacheKey(a, VOICE));
  });
});

describe('different passage, different object', () => {
  it('never serves one lesson audio for another', () => {
    expect(speechCacheKey('Evaporation.', VOICE)).not.toBe(speechCacheKey('Condensation.', VOICE));
  });

  it('separates voices, so changing model does not serve the old voice', () => {
    const text = 'Good morning class.';
    expect(speechCacheKey(text, VOICE)).not.toBe(speechCacheKey(text, '@cf/deepgram/aura-1'));
  });

  it('is case and punctuation sensitive — those change how it is read aloud', () => {
    expect(speechCacheKey('Read this.', VOICE)).not.toBe(speechCacheKey('read this.', VOICE));
    expect(speechCacheKey('Ready?', VOICE)).not.toBe(speechCacheKey('Ready!', VOICE));
  });
});

describe('the key itself', () => {
  it('is a content hash under a versioned prefix, not user-controlled text', () => {
    // A learner-supplied string must never reach the object path: no traversal,
    // no unbounded length, no leaking the passage into storage listings.
    const key = speechCacheKey('../../etc/passwd and a very long lesson passage', VOICE);
    expect(key).toMatch(/^tts\/v1\/[0-9a-f]{64}\.mp3$/);
    expect(key).not.toContain('..');
  });
});
