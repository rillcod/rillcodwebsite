import { afterEach, describe, expect, it } from 'vitest';
import { fanoutAllSucceeded, fanoutFailures, resolveFanoutOrigin } from './cron-fanout';

describe('cron fanout helpers', () => {
  it('detects all-ok fanout', () => {
    expect(fanoutAllSucceeded({ 'academic-readiness': 'ok', 'auto-generate-content': 'ok' })).toBe(true);
    expect(fanoutAllSucceeded({ a: 'ok', b: 'http_500' })).toBe(false);
  });

  it('lists failed children', () => {
    expect(fanoutFailures({ a: 'ok', b: 'error', c: 'http_502' })).toEqual([
      ['b', 'error'],
      ['c', 'http_502'],
    ]);
  });
});

describe('resolveFanoutOrigin', () => {
  const original = process.env.NEXT_PUBLIC_APP_URL;
  afterEach(() => { process.env.NEXT_PUBLIC_APP_URL = original; });

  it('uses the request origin for a real host', () => {
    expect(resolveFanoutOrigin('https://www.rillcod.com/api/cron/onboarding-sweep'))
      .toBe('https://www.rillcod.com');
  });

  it('keeps working in local development', () => {
    expect(resolveFanoutOrigin('http://localhost:3000/api/cron/onboarding-sweep'))
      .toBe('http://localhost:3000');
  });

  // The Cloudflare Containers gateway proxies to container.local, which parses as a valid URL but
  // resolves from nowhere — calling it back would fail DNS and silently drop every child job.
  it('falls back to the public URL for an internal gateway hostname', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://cf.rillcod.com';
    expect(resolveFanoutOrigin('http://container.local/api/cron/academic-readiness'))
      .toBe('https://cf.rillcod.com');
  });

  it('falls back when the request URL cannot be parsed', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://cf.rillcod.com/';
    expect(resolveFanoutOrigin('not a url')).toBe('https://cf.rillcod.com');
  });
});
