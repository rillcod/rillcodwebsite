import { describe, expect, it } from 'vitest';
import {
  checkLiveKitJoinCapacity,
  isCapacityRejection,
  capacityProbeUrl,
  LIVE_SESSION_CAPACITY_MESSAGE,
} from './capacity';

/**
 * The failure this exists for: LiveKit answered a real join with
 * `429 connection minutes limit exceeded. please contact the project owner.`
 * while our token minted fine and the room was created fine, so the class sat on
 * "Connecting…" and nothing anywhere said why.
 *
 * The rule that matters more than detecting it is failing open. This check runs on
 * the join path, so if it is ever unsure it must get out of the way.
 */

const res = (status: number, body = '') =>
  ({ ok: status >= 200 && status < 300, status, text: async () => body }) as unknown as Response;

describe('isCapacityRejection', () => {
  it('recognises the message LiveKit actually sent', () => {
    expect(isCapacityRejection(429, 'connection minutes limit exceeded. please contact the project owner.'))
      .toBe(true);
  });

  it('treats a bare 429 or 402 as capacity', () => {
    expect(isCapacityRejection(429, '')).toBe(true);
    expect(isCapacityRejection(402, '')).toBe(true);
  });

  it('does not mistake an ordinary auth failure for a billing problem', () => {
    expect(isCapacityRejection(401, 'invalid token')).toBe(false);
    expect(isCapacityRejection(403, 'permissions denied')).toBe(false);
    expect(isCapacityRejection(404, 'not found')).toBe(false);
    expect(isCapacityRejection(500, 'internal error')).toBe(false);
  });

  it('accepts a 403 only when the body says it is about the account', () => {
    expect(isCapacityRejection(403, 'connection minutes exhausted')).toBe(true);
    expect(isCapacityRejection(403, 'token expired')).toBe(false);
  });
});

describe('capacityProbeUrl', () => {
  it('turns the ws url the client uses into the https origin to ask', () => {
    expect(capacityProbeUrl('wss://example.livekit.cloud', 'TOK'))
      .toBe('https://example.livekit.cloud/rtc/validate?access_token=TOK&protocol=15&sdk=js');
  });

  it('tolerates a trailing slash and a ws:// scheme', () => {
    expect(capacityProbeUrl('ws://example.livekit.cloud/', 'TOK')).toContain('https://example.livekit.cloud/rtc/validate');
  });
});

describe('checkLiveKitJoinCapacity', () => {
  const base = { wsUrl: 'wss://example.livekit.cloud', token: 'TOK' };

  it('blocks, with an explanation, when LiveKit refuses on minutes', async () => {
    const result = await checkLiveKitJoinCapacity({
      ...base,
      fetchImpl: async () => res(429, 'connection minutes limit exceeded'),
    });
    expect(result.blocked).toBe(true);
    expect(result.blocked && result.message).toBe(LIVE_SESSION_CAPACITY_MESSAGE);
  });

  it('lets a healthy join through', async () => {
    const result = await checkLiveKitJoinCapacity({ ...base, fetchImpl: async () => res(200, '') });
    expect(result.blocked).toBe(false);
  });

  // Everything below is the fail-open contract. A check that cannot answer must
  // never be the reason a class does not start.
  it('fails open when the probe times out', async () => {
    const result = await checkLiveKitJoinCapacity({
      ...base,
      timeoutMs: 10,
      fetchImpl: (_u, init) => new Promise((_resolve, reject) => {
        (init?.signal as AbortSignal | undefined)?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      }),
    });
    expect(result.blocked).toBe(false);
  });

  it('fails open when the network is down', async () => {
    const result = await checkLiveKitJoinCapacity({
      ...base,
      fetchImpl: async () => { throw new Error('ENOTFOUND'); },
    });
    expect(result.blocked).toBe(false);
  });

  it('fails open on a server error, which says nothing about the account', async () => {
    const result = await checkLiveKitJoinCapacity({ ...base, fetchImpl: async () => res(503, 'upstream down') });
    expect(result.blocked).toBe(false);
  });

  it('fails open when the body cannot be read', async () => {
    const broken = { ok: false, status: 429, text: async () => { throw new Error('stream closed'); } } as unknown as Response;
    const result = await checkLiveKitJoinCapacity({ ...base, fetchImpl: async () => broken });
    expect(result.blocked).toBe(false);
  });

  it('fails open rather than probing with nothing to probe with', async () => {
    let called = false;
    const spy = async () => { called = true; return res(429, 'limit exceeded'); };
    expect((await checkLiveKitJoinCapacity({ wsUrl: '', token: 'TOK', fetchImpl: spy })).blocked).toBe(false);
    expect((await checkLiveKitJoinCapacity({ wsUrl: base.wsUrl, token: '', fetchImpl: spy })).blocked).toBe(false);
    expect(called).toBe(false);
  });
});
