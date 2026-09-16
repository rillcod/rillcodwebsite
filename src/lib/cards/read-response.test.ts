import { afterEach, describe, expect, it, vi } from 'vitest';
import { readCardResponse } from './read-response';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('card loading deadline', () => {
  it('preserves data and HTTP failures for the caller', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"Denied"}', { status: 403 })));
    const response = await readCardResponse('/cards');
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Denied' });
  });
  it.each(['connection', 'body'])('releases the screen when the %s hangs without retrying', async (stage) => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url, init) => {
      signal = init.signal;
      return stage === 'connection' ? new Promise(() => {}) : Promise.resolve({
        arrayBuffer: () => new Promise(() => {}),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const pending = expect(readCardResponse('/cards', {}, 100)).rejects.toThrow('Loading took too long');
    await vi.advanceTimersByTimeAsync(100);
    await pending;
    expect(signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
