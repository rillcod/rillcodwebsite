/**
 * Shared helpers for reading a Google OAuth identity off a Supabase auth user.
 *
 * Two flows consume Google sign-in and they need OPPOSITE things:
 *
 *  - Login (`resolve-parent-google.ts`) requires an EXISTING parent portal and
 *    refuses to create one. Google there answers "who is this known parent?".
 *  - Parent claim requires the parent to have NO account yet — creating it is
 *    the entire point. Google there answers only "does this person control this
 *    email address?", which is exactly what the emailed OTP proves, just
 *    stronger (not interceptable, not forwardable, inherits the user's own 2FA).
 *
 * Keeping the identity reading in one place means the two flows can differ in
 * policy without drifting on what counts as a verified Google email.
 */

export type GoogleAuthUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
  identities?: Array<{ provider?: string | null } | null> | null;
};

/** Display name Google supplies, if any. Never invents one. */
export function googleDisplayName(user: Pick<GoogleAuthUser, 'user_metadata'>): string | null {
  const meta = user.user_metadata ?? {};
  for (const key of ['full_name', 'name', 'fullName'] as const) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/** True when this session was actually established through Google, not a password. */
export function isGoogleIdentity(user: GoogleAuthUser): boolean {
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
  if (appMeta.provider === 'google') return true;
  const providers = appMeta.providers;
  if (Array.isArray(providers) && providers.includes('google')) return true;
  return (user.identities ?? []).some((identity) => identity?.provider === 'google');
}

export type VerifiedGoogleEmail =
  | { ok: true; email: string; fullName: string | null }
  | { ok: false; error: string; status: number };

/**
 * Proof-of-email-ownership only — deliberately says nothing about whether the
 * person has a Rillcod account. Callers that need an existing account must check
 * that themselves.
 */
export function resolveVerifiedGoogleEmail(user: GoogleAuthUser | null | undefined): VerifiedGoogleEmail {
  if (!user) {
    return { ok: false, status: 401, error: 'Google sign-in has expired. Please verify with Google again.' };
  }

  if (!isGoogleIdentity(user)) {
    // A password session also "owns" its email, but accepting it here would let
    // any signed-in user (a student, say) silently drive the Google branch of
    // the claim form. Keep the two proofs separate.
    return {
      ok: false,
      status: 403,
      error: 'This session was not created with Google. Use the emailed code instead, or sign in with Google.',
    };
  }

  const email = user.email?.trim().toLowerCase();
  if (!email) {
    return {
      ok: false,
      status: 400,
      error: 'Google did not return an email address. Use a Google account that has one, or verify by code instead.',
    };
  }

  if (!user.email_confirmed_at) {
    return {
      ok: false,
      status: 403,
      error: 'This Google email is not confirmed. Please verify by code instead.',
    };
  }

  return { ok: true, email, fullName: googleDisplayName(user) };
}
