'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

const WARN_BEFORE_MS = 10 * 60 * 1000; // banner 10 min before expiry
const INTERACTION_WINDOW_MS = 5 * 60 * 1000; // silent refresh on any click/key while banner is up
const FATAL_REFRESH_STREAK = 3; // only force logout after several confirmed dead-token failures
const FATAL_COOLDOWN_MS = 60_000; // ignore rapid repeat failures from the same glitch

export interface SessionExpiryState {
  /** True when fewer than 10 minutes remain on the current JWT */
  isExpiringSoon: boolean;
  /** Call this when the user clicks "Stay signed in" */
  refreshSession: () => Promise<boolean>;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isAuthBypassUrl(url: string): boolean {
  return (
    url.includes('/api/auth/signout') ||
    url.includes('/api/auth/login') ||
    url.includes('/login') ||
    url.includes('/auth/')
  );
}

function isFatalRefreshError(error: { message?: string; code?: string } | null): boolean {
  const msg = (error?.message || '').toLowerCase();
  const code = error?.code || '';
  return (
    code === 'refresh_token_not_found' ||
    code === 'session_not_found' ||
    msg.includes('invalid refresh token') ||
    msg.includes('refresh token not found') ||
    msg.includes('session not found')
  );
}

/**
 * Monitors the Supabase JWT exp claim and:
 *  - Shows a warning banner when < 10 minutes remain
 *  - Silently refreshes on focus / interaction
 *  - Only signs out after repeated *confirmed* dead refresh tokens
 *
 * Also patches fetch to retry once after a silent refresh on 401 — but never
 * signs the user out from a permission 401 or a flaky PWA network blip.
 */
export function useSessionExpiry(): SessionExpiryState {
  const router = useRouter();
  const [isExpiringSoon, setIsExpiringSoon] = useState(false);
  const bannerShownAtRef = useRef<number | null>(null);
  const refreshPromiseRef = useRef<Promise<boolean> | null>(null);
  const fetch401PatchedRef = useRef(false);
  const fatalStreakRef = useRef(0);
  const lastFatalAtRef = useRef(0);
  const signingOutRef = useRef(false);

  const signOutExpired = useCallback(async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    try {
      await fetch('/api/auth/signout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'x-rillcod-signout': '1' },
        redirect: 'manual',
      }).catch(() => null);
      await supabase.auth.signOut({ scope: 'global' }).catch(() => null);
      router.push('/login?reason=session_expired');
    } finally {
      // Allow a later recovery path if navigation somehow fails.
      window.setTimeout(() => {
        signingOutRef.current = false;
      }, 5_000);
    }
  }, [router]);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    refreshPromiseRef.current = (async () => {
      try {
        const { data, error } = await supabase.auth.refreshSession();
        if (!error && data.session) {
          fatalStreakRef.current = 0;
          setIsExpiringSoon(false);
          bannerShownAtRef.current = null;
          return true;
        }

        // Offline / background flakiness — keep the session, try again later.
        if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
        if (!isFatalRefreshError(error)) return false;

        const now = Date.now();
        if (now - lastFatalAtRef.current > FATAL_COOLDOWN_MS) {
          fatalStreakRef.current = 0;
        }
        lastFatalAtRef.current = now;
        fatalStreakRef.current += 1;

        // Require a streak so one bad PWA resume does not eject the user mid-work.
        if (fatalStreakRef.current >= FATAL_REFRESH_STREAK) {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            await signOutExpired();
          } else {
            // Local session still present — reset streak and keep working.
            fatalStreakRef.current = 0;
          }
        }
        return false;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    return refreshPromiseRef.current;
  }, [signOutExpired]);

  // ── Poll JWT exp every 60 s ───────────────────────────────────────────────
  useEffect(() => {
    async function checkExpiry() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.expires_at) return;

      const msRemaining = session.expires_at * 1000 - Date.now();

      if (msRemaining <= WARN_BEFORE_MS) {
        if (!isExpiringSoon) {
          setIsExpiringSoon(true);
          bannerShownAtRef.current = Date.now();
        }
        // Always try a quiet refresh when we are inside the warn window —
        // success clears the banner; failure does not log out by itself.
        await refreshSession();
      } else {
        setIsExpiringSoon(false);
        bannerShownAtRef.current = null;
      }
    }

    void checkExpiry();
    const timer = setInterval(() => {
      void checkExpiry();
    }, 60_000);
    return () => clearInterval(timer);
  }, [isExpiringSoon, refreshSession]);

  // ── Background tabs / PWA resume — refresh, never force logout here ───────
  useEffect(() => {
    async function refreshIfNeeded() {
      const { data: { session } } = await supabase.auth.getSession();
      const expiresAt = session?.expires_at;
      if (!expiresAt) return;

      const msRemaining = expiresAt * 1000 - Date.now();
      if (msRemaining <= WARN_BEFORE_MS) {
        await refreshSession();
      }
    }

    function onFocus() {
      void refreshIfNeeded();
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') void refreshIfNeeded();
    }

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refreshSession]);

  // ── Any interaction while the banner is up → silent refresh ───────────────
  useEffect(() => {
    if (!isExpiringSoon) return;

    function onInteraction() {
      const shownAt = bannerShownAtRef.current;
      if (shownAt && Date.now() - shownAt <= INTERACTION_WINDOW_MS) {
        void refreshSession();
      }
    }

    window.addEventListener('click', onInteraction);
    window.addEventListener('keydown', onInteraction);
    window.addEventListener('touchstart', onInteraction, { passive: true });
    return () => {
      window.removeEventListener('click', onInteraction);
      window.removeEventListener('keydown', onInteraction);
      window.removeEventListener('touchstart', onInteraction);
    };
  }, [isExpiringSoon, refreshSession]);

  // ── Patch fetch: retry once after refresh — NEVER logout from 401 alone ──
  useEffect(() => {
    if (fetch401PatchedRef.current) return;
    fetch401PatchedRef.current = true;

    const originalFetch = globalThis.fetch;

    globalThis.fetch = async function patchedFetch(
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      const response = await originalFetch(input, init);
      if (response.status !== 401) return response;

      const url = requestUrl(input);
      if (isAuthBypassUrl(url)) return response;

      // Permission / scope 401s are normal. Refresh once in case the JWT
      // simply expired, then retry. Do not treat a second 401 as logout —
      // that was ejecting people mid-dashboard for ordinary authorization misses.
      const ok = await refreshSession();
      if (!ok) return response;
      return originalFetch(input, init);
    };

    return () => {
      globalThis.fetch = originalFetch;
      fetch401PatchedRef.current = false;
    };
  }, [refreshSession]);

  return { isExpiringSoon, refreshSession };
}
