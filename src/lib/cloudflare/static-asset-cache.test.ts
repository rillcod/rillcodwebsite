import { describe, expect, it } from 'vitest';
import {
  apexRedirectResponse,
  isCacheableVersionedAsset,
  isScannerProbeRequest,
  isVersionedAssetRequest,
} from './static-asset-cache';

describe('gateway static cache boundary', () => {
  it('allows build assets and excludes customer pages, APIs, uploads and partial requests', () => {
    expect(isVersionedAssetRequest(new Request('https://rillcod.com/_next/static/chunks/abc.js'))).toBe(true);
    for (const path of ['/dashboard', '/api/reports', '/uploads/report.pdf']) {
      expect(isVersionedAssetRequest(new Request(`https://rillcod.com${path}`))).toBe(false);
    }
    expect(isVersionedAssetRequest(new Request('https://rillcod.com/_next/static/a.js', { headers: { range: 'bytes=0-5' } }))).toBe(false);
  });
  it('requires explicit immutable public caching and rejects errors and cookies', () => {
    const headers = { 'cache-control': 'public, max-age=31536000, immutable' };
    expect(isCacheableVersionedAsset(new Response('asset', { headers }))).toBe(true);
    expect(isCacheableVersionedAsset(new Response('asset', { headers: { ...headers, 'set-cookie': 'private=value' } }))).toBe(false);
    expect(isCacheableVersionedAsset(new Response('asset', { headers: { 'cache-control': 'private, immutable' } }))).toBe(false);
    expect(isCacheableVersionedAsset(new Response('missing', { status: 404, headers }))).toBe(false);
  });
  it('redirects bare apex GET requests at the edge without waking the container', () => {
    const redirect = apexRedirectResponse(new Request('https://rillcod.com/login?next=/dashboard'));
    expect(redirect?.status).toBe(301);
    expect(redirect?.headers.get('location')).toBe('https://www.rillcod.com/login?next=/dashboard');
    expect(apexRedirectResponse(new Request('https://www.rillcod.com/login'))).toBeNull();
  });
  it('blocks common scanner probes before they can wake the container', () => {
    for (const probe of ['/.env', '/.git/config', '/wp-login.php', '/wp-admin/setup-config.php', '/xmlrpc.php']) {
      expect(isScannerProbeRequest(new Request(`https://www.rillcod.com${probe}`))).toBe(true);
    }
    for (const valid of ['/', '/login', '/dashboard', '/api/auth/me']) {
      expect(isScannerProbeRequest(new Request(`https://www.rillcod.com${valid}`))).toBe(false);
    }
  });
});
