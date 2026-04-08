import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { getClientIp } from './rateLimit.proxy';

function makeRequest(headers: Record<string, string>) {
  return new NextRequest('http://localhost/api/test', { headers });
}

describe('getClientIp', () => {
  it('uses first ip from x-forwarded-for', () => {
    const req = makeRequest({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' });
    expect(getClientIp(req)).toBe('203.0.113.5');
  });

  it('falls back to x-real-ip', () => {
    const req = makeRequest({ 'x-real-ip': '198.51.100.8' });
    expect(getClientIp(req)).toBe('198.51.100.8');
  });

  it('falls back to localhost when no headers exist', () => {
    const req = makeRequest({});
    expect(getClientIp(req)).toBe('127.0.0.1');
  });
});
