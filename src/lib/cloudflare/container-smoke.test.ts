import { describe, expect, it, vi } from 'vitest';
import { checkSmokePath } from '../../../scripts/lib/container-smoke.mjs';

describe('deployment smoke readiness', () => {
  const options = () => ({ sleep: vi.fn().mockResolvedValue(undefined), log: vi.fn() });
  it('recovers a transient startup failure without accepting the 503', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    expect(await checkSmokePath('https://example.com/login', [200], { ...options(), fetchImpl })).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
  it('fails persistent unavailability after exactly three requests', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(new Response('', { status: 503 })));
    expect(await checkSmokePath('https://example.com/', [200], { ...options(), fetchImpl })).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it('does not retry application errors or hide broken login redirects', async () => {
    for (const status of [500, 404, 302]) {
      const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status }));
      expect(await checkSmokePath('https://example.com/login', [200], { ...options(), fetchImpl })).toBe(false);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });
  it('accepts the auth endpoint expected denial and sets a request deadline', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    expect(await checkSmokePath('https://example.com/api/auth/me', [200, 401, 403], { ...options(), fetchImpl })).toBe(true);
    expect(fetchImpl.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(fetchImpl.mock.calls[0][1].redirect).toBe('manual');
  });
  it('bounds network failure retries', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network unavailable'));
    expect(await checkSmokePath('https://example.com/', [200], { ...options(), fetchImpl })).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
