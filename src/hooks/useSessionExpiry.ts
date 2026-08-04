'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

const WARN_BEFORE_MS = 10 * 60 * 1000;
const REFRESH_DEBOUNCE_MS = 2 * 60 * 1000; // never hammer refresh — races middleware on mobile

export interface SessionExpiryState {
  isExpiringSoon: boolean;
  refreshSession: () => Promise<boolean>;
}

/**
 * Soft session helper for the dashboard.
 *
 * IMPORTANT (mobile / PWA): do NOT auto-sign-out and do NOT refresh on every
 * focus/401. Middleware also refreshes cookies via getUser(); parallel
 * refreshSession() calls rotate the refresh token and one side loses → sudden
 * redirect to /login. We only warn and refresh sparingly.
 */
export function useSessionExpiry(): SessionExpiryState {
  const [isExpiringSoon, setIsExpiringSoon] = useState(false);
  const refreshPromiseRef = useRef<Promise<boolean> | null>(null);
  const lastRefreshAtRef = useRef(0);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const now = Date.now();
    if (now - lastRefreshAtRef.current < REFRESH_DEBOUNCE_MS) {
      return true; // recently refreshed — treat as ok, avoid rotation races
    }

    refreshPromiseRef.current = (async () => {
      try {
        if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
        const { data, error } = await supabase.auth.refreshSession();
        if (!error && data.session) {
          lastRefreshAtRef.current = Date.now();
          setIsExpiringSoon(false);
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    return refreshPromiseRef.current;
  }, []);

  // Poll expiry — warn only. Never sign the user out from here.
  useEffect(() => {
    async function checkExpiry() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.expires_at) return;

      const msRemaining = session.expires_at * 1000 - Date.now();
      if (msRemaining <= WARN_BEFORE_MS) {
        setIsExpiringSoon(true);
        // One quiet refresh when we enter the warn window (debounced).
        await refreshSession();
      } else {
        setIsExpiringSoon(false);
      }
    }

    void checkExpiry();
    const timer = setInterval(() => {
      void checkExpiry();
    }, 120_000);
    return () => clearInterval(timer);
  }, [refreshSession]);

  // On resume, refresh only if the token is actually near expiry (debounced).
  useEffect(() => {
    async function onResume() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.expires_at) return;
      const msRemaining = session.expires_at * 1000 - Date.now();
      if (msRemaining <= WARN_BEFORE_MS) {
        await refreshSession();
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') void onResume();
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [refreshSession]);

  return { isExpiringSoon, refreshSession };
}
