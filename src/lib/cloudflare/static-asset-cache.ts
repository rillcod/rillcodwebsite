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

const PUBLIC_STATIC_EXACT_PATHS = new Set([
  '/favicon.ico',
  '/manifest.json',
  '/robots.txt',
  '/sitemap.xml',
  '/apple-touch-icon.png',
  '/icon.svg',
]);

/** Static files in `public/` safe to cache at the Cloudflare edge without waking the container. */
export function isPublicStaticFileRequest(request: Request): boolean {
  if (request.method !== 'GET' || request.headers.has('range')) return false;
  const { pathname } = new URL(request.url);
  return pathname.startsWith('/images/') || PUBLIC_STATIC_EXACT_PATHS.has(pathname);
}

export const PUBLIC_MARKETING_PATHS = new Set([
  '/',
  '/about',
  '/programs',
  '/curriculum',
  '/pricing',
  '/contact',
  '/events',
  '/student-projects',
  '/team',
  '/careers',
  '/faq',
  '/testimonials',
  '/gallery',
  '/privacy-policy',
  '/terms-of-service',
  '/login',
  '/student-registration',
  '/school-registration',
]);

/** True when a request carries a Supabase session or Rillcod dashboard gate cookie. */
export function hasSupabaseSessionCookie(request: Request): boolean {
  const cookie = request.headers.get('cookie') ?? '';
  if (!cookie) return false;
  return /\bsb-[a-z0-9_-]*-auth-token\b/i.test(cookie) || /\brillcod_dash_gate\b/.test(cookie);
}

/**
 * Anonymous HTML GET requests to public marketing pages that can be served
 * directly from Cloudflare Edge Cache without waiting for a container cold boot.
 */
export function isPublicMarketingPageRequest(request: Request): boolean {
  if (request.method !== 'GET') return false;
  if (request.headers.has('range') || request.headers.has('authorization')) return false;
  if (hasSupabaseSessionCookie(request)) return false;

  const url = new URL(request.url);
  if (
    request.headers.has('rsc') ||
    request.headers.has('next-router-prefetch') ||
    url.searchParams.has('_rsc')
  ) {
    return false;
  }

  const normalizedPath =
    url.pathname.length > 1 && url.pathname.endsWith('/')
      ? url.pathname.slice(0, -1)
      : url.pathname;

  if (!PUBLIC_MARKETING_PATHS.has(normalizedPath)) return false;

  if (normalizedPath === '/login') {
    if (
      url.searchParams.get('clear') === '1' ||
      url.searchParams.get('signed_out') === '1' ||
      url.searchParams.get('session_expired') === '1' ||
      url.searchParams.has('account_error')
    ) {
      return false;
    }
  }

  return true;
}

const NON_HUMAN_UA_RE =
  /bot|crawler|spider|slurp|facebookexternalhit|whatsapp|twitterbot|slackbot|discordbot|linkedinbot|curl|wget|python|headless|uptimerobot/i;

/** True for interactive browser document navigations (excluding bots/monitors). */
export function isHumanBrowserNavigation(request: Request): boolean {
  if (request.method !== 'GET') return false;
  const ua = request.headers.get('user-agent') ?? '';
  if (NON_HUMAN_UA_RE.test(ua)) return false;

  const secFetchMode = request.headers.get('sec-fetch-mode');
  const secFetchDest = request.headers.get('sec-fetch-dest');
  const accept = request.headers.get('accept') ?? '';
  return secFetchMode === 'navigate' || secFetchDest === 'document' || accept.includes('text/html');
}
