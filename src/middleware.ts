import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareSupabase } from '@/lib/supabase/middleware';
import { isDashboardPathBlockedForRole } from '@/lib/dashboard/route-access';

export async function middleware(request: NextRequest) {
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

  const pathname = request.nextUrl.pathname;

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

  return getResponse();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
