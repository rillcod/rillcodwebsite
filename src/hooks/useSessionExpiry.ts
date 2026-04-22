'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

const WARN_BEFORE_MS = 5 * 60 * 1000;   // show banner 5 min before expiry
const INTERACTION_WINDOW_MS = 60 * 1000; // silent refresh if user acts within 60 s of banner

export interface SessionExpiryState {
  /** True when fewer than 5 minutes remain on the current JWT */
  isExpiringSoon: boolean;
  /** Call this when the user clicks "Stay signed in" */
  refreshSession: () => Promise<void>;
}

/**
 * Monitors the Supabase JWT exp claim and:
 *  - Shows a warning banner when < 5 minutes remain (Req 16.1)
 *  - Silently refreshes the session on user interaction within 60 s (Req 16.2)
 *  - Signs the user out and redirects to /login on refresh failure (Req 16.3)
 *
 * Also patches globalThis.fetch to intercept 401 responses and attempt one
 * silent refresh before retrying the original request (Req 16.4).
 *
 * Must be used inside a client component within the dashboard layout.
 */
export function useSessionExpiry(): SessionExpiryState {
  const router = useRouter();
  const [isExpiringSoon, setIsExpiringSoon] = useState(false);
  const bannerShownAtRef = useRef<number | null>(null);
  const refreshingRef = useRef(false);
  const fetch401PatchedRef = useRef(false);

  const handleExpired = useCallback(async () => {
    await supabase.auth.signOut();
    router.push('/login?reason=session_expired');
  }, [router]);

  const refreshSession = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        await handleExpired();
      } else {
        setIsExpiringSoon(false);
        bannerShownAtRef.current = null;
      }
    } finally {
      refreshingRef.current = false;
    }
  }, [handleExpired]);

  // ── Poll JWT exp every 30 s ───────────────────────────────────────────────
  useEffect(() => {
    async function checkExpiry() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const expiresAt = session.expires_at; // Unix seconds
      if (!expiresAt) return;

      const msRemaining = expiresAt * 1000 - Date.now();

      if (msRemaining <= WARN_BEFORE_MS && msRemaining > 0) {
        if (!isExpiringSoon) {
          setIsExpiringSoon(true);
          bannerShownAtRef.current = Date.now();
        }
      } else if (msRemaining <= 0) {
        await handleExpired();
      } else {
        setIsExpiringSoon(false);
        bannerShownAtRef.current = null;
      }
    }

    checkExpiry();
    const timer = setInterval(checkExpiry, 30_000);
    return () => clearInterval(timer);
  }, [isExpiringSoon, handleExpired]);

  // ── User interaction listener — silent refresh within 60 s of banner ──────
  useEffect(() => {
    if (!isExpiringSoon) return;

    function onInteraction() {
      const shownAt = bannerShownAtRef.current;
      if (shownAt && Date.now() - shownAt <= INTERACTION_WINDOW_MS) {
        refreshSession();
      }
    }

    window.addEventListener('click', onInteraction, { once: true });
    window.addEventListener('keydown', onInteraction, { once: true });
    return () => {
      window.removeEventListener('click', onInteraction);
      window.removeEventListener('keydown', onInteraction);
    };
  }, [isExpiringSoon, refreshSession]);

  // ── Patch fetch to handle 401 with one silent refresh (Req 16.4) ─────────
  useEffect(() => {
    if (fetch401PatchedRef.current) return;
    fetch401PatchedRef.current = true;

    const originalFetch = globalThis.fetch;

    let refreshPromise: Promise<void> | null = null;

    globalThis.fetch = async function patchedFetch(
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      const response = await originalFetch(input, init);

      if (response.status === 401 && !refreshingRef.current) {
        // Use Promise-based lock to prevent race conditions
        if (!refreshPromise) {
          refreshingRef.current = true;
          refreshPromise = (async () => {
            try {
              const { error } = await supabase.auth.refreshSession();
              if (error) {
                await handleExpired();
              }
            } finally {
              refreshingRef.current = false;
              refreshPromise = null;
            }
          })();
        }
        
        // Wait for refresh to complete
        await refreshPromise;
        
        // Retry original request once
        const retried = await originalFetch(input, init);
        if (retried.status === 401) {
          await handleExpired();
        }
        return retried;
      }

      return response;
    };

    return () => {
      globalThis.fetch = originalFetch;
      fetch401PatchedRef.current = false;
    };
  }, [handleExpired]);

  return { isExpiringSoon, refreshSession };
}
