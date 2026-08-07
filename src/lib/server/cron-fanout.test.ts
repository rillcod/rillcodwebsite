import { afterEach, describe, expect, it } from 'vitest';
import {
  fanoutAllSucceeded,
  fanoutFailures,
  fanoutOriginCandidates,
  resolveFanoutOrigin,
} from './cron-fanout';

describe('cron fanout helpers', () => {
  it('detects all-ok fanout', () => {
    expect(fanoutAllSucceeded({ 'academic-readiness': 'ok', 'auto-generate-content': 'ok' })).toBe(true);
    expect(fanoutAllSucceeded({ a: 'ok', b: 'http_500' })).toBe(false);
  });

  it('lists failed children', () => {
    expect(fanoutFailures({ a: 'ok', b: 'unreachable:ECONNREFUSED', c: 'http_502' })).toEqual([
      ['b', 'unreachable:ECONNREFUSED'],
      ['c', 'http_502'],
    ]);
  });
});

/**
 * These tests used to assert the opposite, and the assertion was the bug.
 *
 * "Use the request's own origin for a real host" reads as obviously correct.
 * But this app is a Node container behind a Worker gateway, and the gateway
 * forwards the public Host through — so the request's own origin is
 * https://www.rillcod.com, and a container calling that must leave Cloudflare
 * and re-enter through the edge. It cannot. fetch threw, every child was
 * recorded as a bare `error`, and nine jobs quietly stopped running.
 *
 * Nothing reported it, because a job that is never invoked cannot fail. It just
 * has an old last_success_at that nothing was reading. Verified on 2026-08-07:
 * every dispatch had been erroring for days while the same paths POSTed from
 * outside answered a healthy 401.
 */
describe('fanoutOriginCandidates', () => {
  const original = process.env.NEXT_PUBLIC_APP_URL;
  const originalPort = process.env.PORT;
  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = original;
    if (originalPort === undefined) delete process.env.PORT;
    else process.env.PORT = originalPort;
  });

  it('tries loopback first, because a self-call must not leave the container', () => {
    const candidates = fanoutOriginCandidates('https://www.rillcod.com/api/cron/onboarding-sweep');
    expect(candidates[0]).toBe('http://127.0.0.1:3000');
  });

  it('honours the port the container actually serves on', () => {
    process.env.PORT = '8080';
    expect(fanoutOriginCandidates('https://www.rillcod.com/x')[0]).toBe('http://127.0.0.1:8080');
  });

  it('keeps the public origin as a fallback rather than dropping it', () => {
    // A host that gives each invocation its own sandbox has no loopback to
    // answer, and must still work exactly as it did before.
    const candidates = fanoutOriginCandidates('https://www.rillcod.com/api/cron/onboarding-sweep');
    expect(candidates).toContain('https://www.rillcod.com');
  });

  it('never offers the internal gateway hostname', () => {
    // container.local parses as a valid URL and resolves from nowhere.
    process.env.NEXT_PUBLIC_APP_URL = 'https://cf.rillcod.com';
    const candidates = fanoutOriginCandidates('http://container.local/api/cron/academic-readiness');
    expect(candidates).not.toContain('http://container.local');
    expect(candidates).toContain('https://cf.rillcod.com');
  });

  it('still has somewhere to go when the request URL cannot be parsed', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://cf.rillcod.com/';
    expect(fanoutOriginCandidates('not a url')).toEqual([
      'http://127.0.0.1:3000',
      'https://cf.rillcod.com',
    ]);
  });

  it('does not repeat an origin', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://www.rillcod.com';
    const candidates = fanoutOriginCandidates('https://www.rillcod.com/api/cron/x');
    expect(new Set(candidates).size).toBe(candidates.length);
  });

  it('resolveFanoutOrigin stays the first candidate, for existing callers', () => {
    expect(resolveFanoutOrigin('https://www.rillcod.com/x')).toBe(
      fanoutOriginCandidates('https://www.rillcod.com/x')[0]
    );
  });
});
