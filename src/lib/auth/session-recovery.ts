const INVALID_REFRESH_TOKEN_CODES = new Set([
  'refresh_token_not_found',
  'refresh_token_already_used',
  'invalid_refresh_token',
]);

function errorField(error: unknown, field: string): unknown {
  if (!error || typeof error !== 'object') return undefined;
  return (error as Record<string, unknown>)[field];
}

/**
 * Supabase returns stale-session failures as values in some paths and throws
 * them in others. Keep this narrow: transient network/auth failures must not
 * sign a legitimate user out.
 */
export function isInvalidRefreshTokenError(error: unknown): boolean {
  const code = String(errorField(error, 'code') ?? '').toLowerCase();
  if (INVALID_REFRESH_TOKEN_CODES.has(code)) return true;

  const message = String(
    errorField(error, 'message') ?? (typeof error === 'string' ? error : ''),
  ).toLowerCase();

  return (
    message.includes('invalid refresh token') ||
    message.includes('refresh token not found') ||
    message.includes('refresh token has already been used')
  );
}

/** Supabase may split a large auth cookie into numbered chunks. */
export function isSupabaseAuthStorageKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  return normalized.startsWith('sb-') && normalized.includes('-auth-token');
}

/** Clear only authentication artefacts; retain customer drafts and preferences. */
export function clearBrowserAuthArtifacts(): void {
  if (typeof window === 'undefined') return;

  try {
    for (const key of Object.keys(window.localStorage)) {
      if (isSupabaseAuthStorageKey(key)) window.localStorage.removeItem(key);
    }
  } catch {
    // Storage may be disabled. The server cookie cleanup still runs.
  }

  try {
    window.sessionStorage.removeItem('rillcod_view_as_role');
  } catch {
    // Storage may be disabled.
  }

  try {
    for (const pair of document.cookie.split(';')) {
      const name = pair.split('=')[0]?.trim();
      if (!name || !isSupabaseAuthStorageKey(name)) continue;
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    }
  } catch {
    // HttpOnly cookies are cleared by the server endpoint.
  }
}

let recoveryInFlight: Promise<void> | null = null;

/**
 * Recover from a genuinely unusable refresh token without clearing unrelated
 * local application data. Concurrent providers/pages share one recovery.
 */
export function recoverInvalidBrowserSession(): Promise<void> {
  if (recoveryInFlight) return recoveryInFlight;

  recoveryInFlight = (async () => {
    try {
      await fetch('/api/auth/signout?json=1', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'x-rillcod-signout': '1',
        },
        redirect: 'manual',
      });
    } catch {
      // Local cleanup still makes the form usable; the next request lets
      // middleware expire any remaining server cookie.
    } finally {
      clearBrowserAuthArtifacts();
    }
  })().finally(() => {
    recoveryInFlight = null;
  });

  return recoveryInFlight;
}
