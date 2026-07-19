import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareSupabase } from '@/lib/supabase/middleware';
import { isDashboardPathBlockedForRole } from '@/lib/dashboard/route-access';

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

  const { supabase, getResponse } = createMiddlewareSupabase(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // App / PWA cold start lands on /login — send signed-in users straight to dashboard
  // (skip when explicitly clearing session via ?clear=1).
  if (user && pathname === '/login' && request.nextUrl.searchParams.get('clear') !== '1') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    const redirectResponse = NextResponse.redirect(url);
    getResponse().cookies.getAll().forEach((c) => {
      redirectResponse.cookies.set(c.name, c.value);
    });
    return redirectResponse;
  }

  // Preserve the exact private destination across an expired or missing session.
  // This avoids rendering a half-loaded dashboard and gives every role a seamless
  // return after signing in, including native Android cold starts and deep links.
  if (!user && pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone();
    const requestedDestination = `${pathname}${request.nextUrl.search}`;
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('redirectedFrom', requestedDestination);
    const redirectResponse = NextResponse.redirect(url);
    getResponse().cookies.getAll().forEach((c) => {
      redirectResponse.cookies.set(c.name, c.value);
    });
    return redirectResponse;
  }

  if (user && pathname.startsWith('/dashboard')) {
    const { data: row } = await supabase
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    const role = row?.role;
    if (isDashboardPathBlockedForRole(pathname, role)) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      url.search = '';
      const redirectResponse = NextResponse.redirect(url);
      getResponse().cookies.getAll().forEach((c) => {
        redirectResponse.cookies.set(c.name, c.value);
      });
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
