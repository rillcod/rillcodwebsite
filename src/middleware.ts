import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareSupabase } from '@/lib/supabase/middleware';
import { isDashboardPathBlockedForRole } from '@/lib/dashboard/route-access';
import {
  isInvalidRefreshTokenError,
  isSupabaseAuthStorageKey,
} from '@/lib/auth/session-recovery';

// Simple sliding window rate limiter using request headers
// For production, use Upstash Redis. This is an IP-based in-process limiter.
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests per minute per IP for inbox APIs

// In-memory store (resets on cold start — acceptable for edge protection)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function getRateLimitKey(req: NextRequest): string {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  return `inbox:${ip}`;
}

function checkRateLimit(key: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const record = rateLimitStore.get(key);
  if (!record || record.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }
  record.count += 1;
  const remaining = Math.max(0, RATE_LIMIT_MAX - record.count);
  return { allowed: record.count <= RATE_LIMIT_MAX, remaining, resetAt: record.resetAt };
}

function expireSupabaseAuthCookies(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  for (const cookie of request.cookies.getAll()) {
    if (!isSupabaseAuthStorageKey(cookie.name)) continue;
    response.cookies.set({
      name: cookie.name,
      value: '',
      path: '/',
      maxAge: 0,
      expires: new Date(0),
      sameSite: 'lax',
    });
  }
  return response;
}

function copyResponseCookies(source: NextResponse, target: NextResponse): void {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie.name, cookie.value);
  });
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  let rateLimitHeaders: Record<string, string> | null = null;

  // Apply rate limiting only to inbox API routes
  if (pathname.startsWith('/api/inbox')) {
    const key = getRateLimitKey(request);
    const { allowed, remaining, resetAt } = checkRateLimit(key);

    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
            'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    rateLimitHeaders = {
      'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
      'X-RateLimit-Remaining': String(remaining),
      'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
    };
  }

  const host = request.headers.get('host');
  const userAgent = request.headers.get('user-agent') || '';

  if (host === 'rillcod.com') {
    const url = request.nextUrl.clone();
    url.host = 'www.rillcod.com';
    return NextResponse.redirect(url, 301);
  }

  if (
    userAgent.includes('facebookexternalhit') ||
    userAgent.includes('Facebot') ||
    userAgent.includes('WhatsApp')
  ) {
    return NextResponse.next();
  }

  // Only execute Supabase auth checks for paths that require them (/dashboard, /login)
  // to avoid concurrent token refresh race conditions from parallel background API or asset requests.
  const requiresAuthCheck = pathname.startsWith('/dashboard') || pathname === '/login';

  if (!requiresAuthCheck) {
    const res = NextResponse.next();
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => res.headers.set(k, v));
    }
    return res;
  }

  const { supabase, getResponse } = createMiddlewareSupabase(request);

  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'] = null;
  let authError: unknown = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
    authError = result.error;
  } catch (error) {
    authError = error;
  }

  if (isInvalidRefreshTokenError(authError)) {
    const url = request.nextUrl.clone();
    const requestedDestination = `${pathname}${request.nextUrl.search}`;
    url.pathname = '/login';
    url.search = '';
    if (pathname.startsWith('/dashboard')) {
      url.searchParams.set('redirectedFrom', requestedDestination);
      url.searchParams.set('session_expired', '1');
    } else {
      url.searchParams.set('session_recovered', '1');
    }
    const redirectResponse = NextResponse.redirect(url);
    copyResponseCookies(getResponse(), redirectResponse);
    return expireSupabaseAuthCookies(request, redirectResponse);
  }

  if (authError) {
    // Network blip on mobile/PWA — do not force login for a transient failure.
    return getResponse();
  }

  // App / PWA cold start lands on /login — send signed-in users straight to dashboard
  // (skip when explicitly clearing session via ?clear=1).
  if (user && pathname === '/login' && request.nextUrl.searchParams.get('clear') !== '1') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    const redirectResponse = NextResponse.redirect(url);
    copyResponseCookies(getResponse(), redirectResponse);
    return redirectResponse;
  }

  // Preserve the exact private destination across an expired or missing session.
  // Soft-pass when sb-* cookies still exist: a parallel client refresh often wins
  // the refresh-token rotation race and getUser() briefly returns null on mobile.
  if (!user && pathname.startsWith('/dashboard')) {
    const hasSupabaseAuthCookie = request.cookies
      .getAll()
      .some((c) => c.name.startsWith('sb-') && Boolean(c.value));
    if (hasSupabaseAuthCookie) {
      return getResponse();
    }

    const url = request.nextUrl.clone();
    const requestedDestination = `${pathname}${request.nextUrl.search}`;
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('redirectedFrom', requestedDestination);
    const redirectResponse = NextResponse.redirect(url);
    copyResponseCookies(getResponse(), redirectResponse);
    return redirectResponse;
  }

  if (user && pathname.startsWith('/dashboard')) {
    const { data: row } = await supabase
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    const role = row?.role;
    if (!role) {
      const url = request.nextUrl.clone();
      const requestedDestination = `${pathname}${request.nextUrl.search}`;
      url.pathname = '/login';
      url.search = '';
      url.searchParams.set('redirectedFrom', requestedDestination);
      url.searchParams.set('account_error', 'profile_missing');
      const redirectResponse = NextResponse.redirect(url);
      copyResponseCookies(getResponse(), redirectResponse);
      return expireSupabaseAuthCookies(request, redirectResponse);
    }
    if (isDashboardPathBlockedForRole(pathname, role)) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      url.search = '';
      const redirectResponse = NextResponse.redirect(url);
      copyResponseCookies(getResponse(), redirectResponse);
      return redirectResponse;
    }
  }

  const response = getResponse();
  if (rateLimitHeaders) {
    Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
  }
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
    '/api/inbox/:path*',
  ],
};
