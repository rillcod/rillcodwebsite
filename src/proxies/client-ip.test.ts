import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { getClientIp } from './rateLimit.proxy';

/**
 * getClientIp decides which requests share a rate-limit bucket, so the header
 * precedence is a security property, not a formatting preference.
 *
 * x-forwarded-for is written by the caller. Cloudflare appends to an inbound
 * value rather than replacing it, so the first entry of that chain is attacker
 * controlled. While it was read first, anyone could rotate it and get a fresh
 * bucket per request — which made every limit built on this function, including
 * the ones on the public Paystack verify routes, decorative.
 */

function req(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost/api/anything', { method: 'POST', headers });
}

describe('getClientIp header precedence', () => {
  it('trusts cf-connecting-ip over a spoofed forwarding chain', () => {
    expect(
      getClientIp(
        req({
          'cf-connecting-ip': '203.0.113.7',
          'x-forwarded-for': '9.9.9.9, 203.0.113.7',
          'x-real-ip': '8.8.8.8',
        }),
      ),
    ).toBe('203.0.113.7');
  });

  it('cannot be shaken off by rotating x-forwarded-for', () => {
    // The attack: same caller, a different made-up chain entry each time. Every
    // request must still land in one bucket.
    const seen = new Set(
      ['1.1.1.1', '2.2.2.2', '3.3.3.3'].map((spoof) =>
        getClientIp(req({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': spoof })),
      ),
    );
    expect(seen).toEqual(new Set(['203.0.113.7']));
  });

  it('falls back to x-real-ip before the client-written chain', () => {
    expect(getClientIp(req({ 'x-real-ip': '8.8.8.8', 'x-forwarded-for': '9.9.9.9' }))).toBe('8.8.8.8');
  });

  it('still reads x-forwarded-for when no trusted header is present', () => {
    // Local development and any non-Cloudflare path.
    expect(getClientIp(req({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }))).toBe('9.9.9.9');
  });

  it('degrades to loopback rather than returning empty', () => {
    // An empty bucket key would collapse every caller into one counter.
    expect(getClientIp(req({}))).toBe('127.0.0.1');
    expect(getClientIp(req({ 'cf-connecting-ip': '   ' }))).toBe('127.0.0.1');
  });
});
