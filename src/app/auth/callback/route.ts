import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { safePostLoginRedirect } from '@/lib/auth/post-login-redirect';
import { resolveParentGoogleLogin } from '@/lib/auth/resolve-parent-google';
import type { Database } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

function loginErrorRedirect(origin: string, message: string) {
  const url = new URL('/login', origin);
  url.searchParams.set('type', 'parent');
  url.searchParams.set('oauth_error', message);
  return NextResponse.redirect(url);
}

/**
 * OAuth / magic-link PKCE callback.
 * Google sign-in is parent-only: existing portal parent + school_id required.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safePostLoginRedirect(searchParams.get('next'));

  if (!code) {
    return loginErrorRedirect(origin, 'Google sign-in was cancelled or incomplete.');
  }

  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component context — middleware will refresh cookies.
          }
        },
      },
    },
  );

  const { data: exchanged, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError || !exchanged.user) {
    return loginErrorRedirect(origin, exchangeError?.message || 'Could not complete Google sign-in.');
  }

  const admin = createAdminClient();
  const resolved = await resolveParentGoogleLogin(admin, exchanged.user, next);

  if (!resolved.ok) {
    await supabase.auth.signOut();
    return loginErrorRedirect(origin, resolved.error);
  }

  const forwardedHost = request.headers.get('x-forwarded-host');
  const isLocal = process.env.NODE_ENV === 'development';
  const base = isLocal ? origin : forwardedHost ? `https://${forwardedHost}` : origin;
  return NextResponse.redirect(`${base}${resolved.redirectTo}`);
}
