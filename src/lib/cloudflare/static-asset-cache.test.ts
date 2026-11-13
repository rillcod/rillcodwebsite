import { describe, expect, it } from 'vitest';
import {
  apexRedirectResponse,
  hasSupabaseSessionCookie,
  isCacheableVersionedAsset,
  isHumanBrowserNavigation,
  isPublicMarketingPageRequest,
  isPublicStaticFileRequest,
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
  it('identifies public static files under /images and top-level metadata files', () => {
    expect(isPublicStaticFileRequest(new Request('https://www.rillcod.com/images/logo.png'))).toBe(true);
    expect(isPublicStaticFileRequest(new Request('https://www.rillcod.com/favicon.ico'))).toBe(true);
    expect(isPublicStaticFileRequest(new Request('https://www.rillcod.com/robots.txt'))).toBe(true);
    expect(isPublicStaticFileRequest(new Request('https://www.rillcod.com/images/logo.png', { method: 'POST' }))).toBe(false);
    expect(isPublicStaticFileRequest(new Request('https://www.rillcod.com/images/logo.png', { headers: { range: 'bytes=0-10' } }))).toBe(false);
    expect(isPublicStaticFileRequest(new Request('https://www.rillcod.com/dashboard'))).toBe(false);
  });
  it('allows anonymous marketing page GETs and excludes authenticated/RSC/login-reset traffic', () => {
    expect(hasSupabaseSessionCookie(new Request('https://www.rillcod.com/', { headers: { cookie: 'sb-abc-auth-token=xyz' } }))).toBe(true);
    expect(hasSupabaseSessionCookie(new Request('https://www.rillcod.com/', { headers: { cookie: 'rillcod_dash_gate=1' } }))).toBe(true);
    expect(hasSupabaseSessionCookie(new Request('https://www.rillcod.com/'))).toBe(false);

    expect(isPublicMarketingPageRequest(new Request('https://www.rillcod.com/'))).toBe(true);
    expect(isPublicMarketingPageRequest(new Request('https://www.rillcod.com/programs/'))).toBe(true);
    expect(isPublicMarketingPageRequest(new Request('https://www.rillcod.com/login'))).toBe(true);
    expect(isPublicMarketingPageRequest(new Request('https://www.rillcod.com/login?clear=1'))).toBe(false);
    expect(isPublicMarketingPageRequest(new Request('https://www.rillcod.com/login?signed_out=1'))).toBe(false);
    expect(isPublicMarketingPageRequest(new Request('https://www.rillcod.com/login?session_expired=1'))).toBe(false);
    expect(isPublicMarketingPageRequest(new Request('https://www.rillcod.com/login?account_error=inactive'))).toBe(false);
    expect(isPublicMarketingPageRequest(new Request('https://www.rillcod.com/dashboard'))).toBe(false);
    expect(isPublicMarketingPageRequest(new Request('https://www.rillcod.com/', { headers: { cookie: 'sb-proj-auth-token=abc' } }))).toBe(false);
    expect(isPublicMarketingPageRequest(new Request('https://www.rillcod.com/', { headers: { rsc: '1' } }))).toBe(false);
    expect(isPublicMarketingPageRequest(new Request('https://www.rillcod.com/?_rsc=123'))).toBe(false);
  });
  it('detects human browser navigations and excludes crawlers and CLI clients', () => {
    expect(isHumanBrowserNavigation(new Request('https://www.rillcod.com/', {
      headers: { 'user-agent': 'Mozilla/5.0 Chrome/120.0', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' },
    }))).toBe(true);
    expect(isHumanBrowserNavigation(new Request('https://www.rillcod.com/', {
      headers: { 'user-agent': 'Mozilla/5.0', accept: 'text/html,application/xhtml+xml' },
    }))).toBe(true);
    expect(isHumanBrowserNavigation(new Request('https://www.rillcod.com/', {
      headers: { 'user-agent': 'curl/8.4.0', accept: 'text/html' },
    }))).toBe(false);
    expect(isHumanBrowserNavigation(new Request('https://www.rillcod.com/', {
      headers: { 'user-agent': 'WhatsApp/2.23', 'sec-fetch-dest': 'document' },
    }))).toBe(false);
  });
});
