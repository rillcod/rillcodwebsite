/** Only Next's versioned build assets are eligible; never HTML, APIs or user uploads. */
export function isVersionedAssetRequest(request: Request): boolean {
  const url = new URL(request.url);
  return request.method === 'GET' && url.pathname.startsWith('/_next/static/')
    && !request.headers.has('range');
}

export function isCacheableVersionedAsset(response: Response): boolean {
  const control = response.headers.get('cache-control') ?? '';
  return response.status === 200 && !response.headers.has('set-cookie')
    && /\bimmutable\b/i.test(control) && /\bpublic\b/i.test(control)
    && !/\b(private|no-store|no-cache)\b/i.test(control)
    && !(response.headers.get('vary') ?? '').includes('*');
}

/**
 * Redirect bare apex rillcod.com -> www.rillcod.com at the Worker edge so
 * apex hits never wake a sleeping container just to receive a 301 redirect.
 */
export function apexRedirectResponse(request: Request): Response | null {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const url = new URL(request.url);
  if (url.hostname.toLowerCase() !== 'rillcod.com') return null;
  url.hostname = 'www.rillcod.com';
  return Response.redirect(url.toString(), 301);
}

const SCANNER_PATH_PREFIXES = [
  '/.env',
  '/.git/',
  '/wp-admin',
  '/wp-content',
  '/wp-includes',
  '/wp-login.php',
  '/xmlrpc.php',
  '/phpmyadmin',
  '/pma',
  '/cgi-bin/',
  '/vendor/phpunit',
  '/actuator/',
] as const;

/**
 * Reject automated vulnerability scanner probes at the Worker edge so 24/7
 * bot traffic cannot wake the paid container just to render a Next.js 404.
 */
export function isScannerProbeRequest(request: Request): boolean {
  const pathname = new URL(request.url).pathname.toLowerCase();
  if (pathname === '/.git' || pathname.endsWith('.php') || pathname.endsWith('.asp') || pathname.endsWith('.aspx')) {
    return true;
  }
  return SCANNER_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
