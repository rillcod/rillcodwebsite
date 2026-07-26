import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { safePostLoginRedirect } from '@/lib/auth/post-login-redirect';
import { resolveParentGoogleLogin } from '@/lib/auth/resolve-parent-google';
import { resolveVerifiedGoogleEmail } from '@/lib/auth/google-identity';
import type { Database } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

function loginErrorRedirect(origin: string, message: string) {
  const url = new URL('/login', origin);
  url.searchParams.set('type', 'parent');
  url.searchParams.set('oauth_error', message);
  return NextResponse.redirect(url);
}

/**
 * Build the return URL for the parent-claim Google flow.
 *
 * The student code round-trips through Google, so it is rebuilt here rather than
 * passed through `next` — `safePostLoginRedirect` only allows /dashboard and
 * /result-check, and widening that allowlist to serve this one flow would loosen
 * the open-redirect guard for every login.
 */
function claimReturnUrl(origin: string, claimCode: string | null, opts: { verified?: boolean; error?: string }) {
  const url = new URL('/parent-claim', origin);
  if (claimCode) url.searchParams.set('code', claimCode);
  if (opts.verified) url.searchParams.set('google', 'verified');
  if (opts.error) url.searchParams.set('google_error', opts.error);
  return url;
}

function claimReturnRedirect(origin: string, claimCode: string | null, message: string) {
  return NextResponse.redirect(claimReturnUrl(origin, claimCode, { error: message }));
}

/** Student codes are short alphanumerics/dashes — refuse anything else outright. */
function safeClaimCode(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9-]{1,32}$/.test(trimmed) ? trimmed : null;
}

/**
 * OAuth / magic-link PKCE callback.
 * Google sign-in is parent-only: existing portal parent + school_id required.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safePostLoginRedirect(searchParams.get('next'));
  const flow = searchParams.get('flow');
  const claimCode = safeClaimCode(searchParams.get('claim_code'));

  if (!code) {
    if (flow === 'claim') {
      return claimReturnRedirect(origin, claimCode, 'Google sign-in was cancelled or incomplete.');
    }
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
    if (flow === 'claim') {
      return claimReturnRedirect(origin, claimCode, exchangeError?.message || 'Could not complete Google sign-in.');
    }
    return loginErrorRedirect(origin, exchangeError?.message || 'Could not complete Google sign-in.');
  }

  // Parent claim deliberately skips resolveParentGoogleLogin: that helper REFUSES
  // emails with no parent account, and here having no account is the whole point.
  // Google is used purely as proof of email ownership; the claim endpoint re-reads
  // this session server-side and provisions through the same kernel the OTP path
  // uses, so nothing is trusted from the browser.
  if (flow === 'claim') {
    const verified = resolveVerifiedGoogleEmail(exchanged.user as never);
    if (!verified.ok) {
      await supabase.auth.signOut();
      return claimReturnRedirect(origin, claimCode, verified.error);
    }
    return NextResponse.redirect(claimReturnUrl(origin, claimCode, { verified: true }));
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
