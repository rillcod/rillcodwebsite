import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareSupabase } from '@/lib/supabase/middleware';
import { isDashboardPathBlockedForRole } from '@/lib/dashboard/route-access';
import {
  createDashboardGateToken,
  DASHBOARD_GATE_COOKIE,
  DASHBOARD_GATE_TTL_SECONDS,
  isDashboardGateRole,
  verifyDashboardGateToken,
} from '@/lib/auth/dashboard-gate';
import {
  isInvalidRefreshTokenError,
  isSupabaseAuthStorageKey,
} from '@/lib/auth/session-recovery';

function expireSupabaseAuthCookies(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  for (const cookie of request.cookies.getAll()) {
    if (!isSupabaseAuthStorageKey(cookie.name) && cookie.name !== DASHBOARD_GATE_COOKIE) continue;
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
    target.cookies.set(cookie);
  });
}

function setDashboardGateCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: DASHBOARD_GATE_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DASHBOARD_GATE_TTL_SECONDS,
  });
}

function redirectForAccountProblem(
  request: NextRequest,
  authResponse: NextResponse,
  problem: 'profile_missing' | 'inactive',
): NextResponse {
  const url = request.nextUrl.clone();
  const requestedDestination = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  url.pathname = '/login';
  url.search = '';
  url.searchParams.set('redirectedFrom', requestedDestination);
  url.searchParams.set('account_error', problem);
  const redirectResponse = NextResponse.redirect(url);
  copyResponseCookies(authResponse, redirectResponse);
  return expireSupabaseAuthCookies(request, redirectResponse);
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

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
    return NextResponse.next();
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
    const cached = verifyDashboardGateToken(
      request.cookies.get(DASHBOARD_GATE_COOKIE)?.value,
      user.id,
    );
    let role = cached?.role;

    if (cached && !cached.active) {
      return redirectForAccountProblem(request, getResponse(), 'inactive');
    }

    if (!cached) {
      let row: { role: string | null; is_active: boolean | null; is_deleted: boolean | null } | null = null;
      let profileError: unknown = null;
      try {
        const result = await supabase
          .from('portal_users')
          .select('role,is_active,is_deleted')
          .eq('id', user.id)
          .maybeSingle();
        row = result.data;
        profileError = result.error;
      } catch (error) {
        profileError = error;
      }

      // A temporary profile read failure must not sign a valid user out. The
      // dashboard guard will retry /api/auth/me and all protected APIs/RLS
      // still perform authoritative authorization.
      if (profileError) return getResponse();
      if (!row?.role || !isDashboardGateRole(row.role)) {
        return redirectForAccountProblem(request, getResponse(), 'profile_missing');
      }
      if (row.is_active !== true || row.is_deleted === true) {
        return redirectForAccountProblem(request, getResponse(), 'inactive');
      }

      role = row.role;
      const token = createDashboardGateToken({
        userId: user.id,
        role,
        active: true,
      });
      if (token) setDashboardGateCookie(getResponse(), token);
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

  return getResponse();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
