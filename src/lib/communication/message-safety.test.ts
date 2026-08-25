import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyMessageSafety, parseGuardResponse } from './message-safety';

/**
 * Safety classification, and the two decisions in it that are not obvious.
 *
 * 1. Self-harm is DELIVERED, not blocked. A child writing that they want to
 *    hurt themselves most needs an adult to see it; silently refusing to send
 *    teaches them this is not a place to say it, and alerts nobody.
 *
 * 2. Everything fails OPEN. A classifier that is slow, broken or unconfigured
 *    must never be the reason a parent cannot reach the school.
 */

const KEYS = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
  process.env.CLOUDFLARE_API_TOKEN = 'token';
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
  vi.restoreAllMocks();
});

function guardSays(response: string) {
  return new Response(JSON.stringify({ result: { response } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('reading the verdict', () => {
  it('accepts the leading-newline shape the model actually returns', () => {
    // Observed live: "\n\nsafe" and "\n\nunsafe\nS11".
    expect(parseGuardResponse('\n\nsafe').safe).toBe(true);
    expect(parseGuardResponse('\n\nunsafe\nS11').safe).toBe(false);
  });

  it('maps hazard codes to labels', () => {
    const verdict = parseGuardResponse('\n\nunsafe\nS11');
    expect(verdict.categories).toEqual([{ code: 'S11', label: 'Suicide and self-harm' }]);
  });

  it('takes the strongest action when several categories fire', () => {
    // S11 alone escalates; with a blocking category present, block wins.
    expect(parseGuardResponse('unsafe\nS11').action).toBe('escalate');
    expect(parseGuardResponse('unsafe\nS11\nS1').action).toBe('block');
  });

  it('does not block on a reply it cannot understand', () => {
    const verdict = parseGuardResponse('I think that seems fine to me');
    expect(verdict.action).toBe('allow');
    expect(verdict.skipped).toBe(true);
  });

  it('escalates rather than blocks when unsafe with no category', () => {
    const verdict = parseGuardResponse('unsafe');
    expect(verdict.safe).toBe(false);
    expect(verdict.action).toBe('escalate');
  });
});

describe('self-harm is heard, not silenced', () => {
  it('escalates S11 instead of blocking it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(guardSays('\n\nunsafe\nS11'));
    const verdict = await classifyMessageSafety('I want to hurt myself.');

    expect(verdict.action).toBe('escalate');
    // The message still goes through. Blocking here is the worst outcome.
    expect(verdict.action).not.toBe('block');
  });

  it('blocks stated violence', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(guardSays('\n\nunsafe\nS1'));
    expect((await classifyMessageSafety('I will beat you until you bleed.')).action).toBe('block');
  });

  it('allows ordinary school talk', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(guardSays('\n\nsafe'));
    const verdict = await classifyMessageSafety('Please explain the water cycle for my homework.');
    expect(verdict.action).toBe('allow');
    expect(verdict.skipped).toBe(false);
  });
});

describe('failing open', () => {
  it('allows when the classifier is not configured', async () => {
    delete process.env.CLOUDFLARE_API_TOKEN;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const verdict = await classifyMessageSafety('anything');
    expect(verdict.action).toBe('allow');
    expect(verdict.skipped).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('allows on an error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }));
    const verdict = await classifyMessageSafety('anything');
    expect(verdict.action).toBe('allow');
    expect(verdict.skipped).toBe(true);
  });

  it('allows when the network throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('socket hang up'));
    expect((await classifyMessageSafety('anything')).action).toBe('allow');
  });

  it('allows when the model returns nothing usable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ result: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect((await classifyMessageSafety('anything')).action).toBe('allow');
  });

  it('never calls out for an empty message', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect((await classifyMessageSafety('   ')).action).toBe('allow');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('what this does not claim to do', () => {
  it('records that grooming patterns are outside its taxonomy', async () => {
    // Verified against the live model before wiring it up: "do not tell your
    // parents, meet me alone after school" comes back safe. This test exists so
    // nobody later presents the classifier to a safeguarding lead as a grooming
    // detector — the keyword list and human reporting remain load-bearing.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(guardSays('\n\nsafe'));
    const verdict = await classifyMessageSafety(
      'Do not tell your parents. Meet me alone after school.',
    );
    expect(verdict.action).toBe('allow');
  });
});
