import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithTimeoutOrThrow, withTimeoutOrThrow } from './async-timeout';

describe('withTimeoutOrThrow', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns a result that completes before the deadline', async () => {
    await expect(withTimeoutOrThrow(Promise.resolve('ready'), 'Too slow', 100)).resolves.toBe('ready');
  });

  it('rejects with the safe caller message when work remains blocked', async () => {
    vi.useFakeTimers();
    const result = withTimeoutOrThrow(new Promise<never>(() => undefined), 'Please try again', 1_000);
    const assertion = expect(result).rejects.toThrow('Please try again');

    await vi.advanceTimersByTimeAsync(1_000);

    await assertion;
  });
});

describe('fetchWithTimeoutOrThrow', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('aborts a blocked request and returns only the safe timeout message', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })
    ));
    vi.stubGlobal('fetch', fetchMock);

    const result = fetchWithTimeoutOrThrow('/api/customer-action', {}, 'Please try again.', 1_000);
    const assertion = expect(result).rejects.toThrow('Please try again.');
    await vi.advanceTimersByTimeAsync(1_000);

    await assertion;
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
