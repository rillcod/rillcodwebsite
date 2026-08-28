import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchWithTimeoutOrThrow,
  friendlyActionError,
  parseJsonResponse,
  withTimeoutOrThrow,
} from './async-timeout';

describe('parseJsonResponse', () => {
  it('returns empty object for empty body', async () => {
    const response = new Response('', { status: 200 });
    await expect(parseJsonResponse(response)).resolves.toEqual({});
  });

  it('returns empty object for invalid JSON', async () => {
    const response = new Response('not-json', { status: 200 });
    await expect(parseJsonResponse(response)).resolves.toEqual({});
  });

  it('parses valid JSON objects', async () => {
    const response = new Response(JSON.stringify({ ok: true }), { status: 200 });
    await expect(parseJsonResponse<{ ok: boolean }>(response)).resolves.toEqual({ ok: true });
  });
});

describe('friendlyActionError', () => {
  it('maps empty JSON parse failures to user-safe copy', () => {
    expect(
      friendlyActionError(new Error("Failed to execute 'json' on 'Response': Unexpected end of JSON input"), 'fallback'),
    ).toBe('The server returned an empty response. Please check your connection and try again.');
  });

  it('returns the original message when present', () => {
    expect(friendlyActionError(new Error('Invalid credentials'), 'fallback')).toBe('Invalid credentials');
  });
});

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
