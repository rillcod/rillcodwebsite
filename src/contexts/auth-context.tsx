'use client';

import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { UserProfile, AuthContextType, UserRole } from '@/types';
import { apiFetch } from '@/lib/api-fetch';

// ── "View as role" simulator ──
// A UI-only preview tool so admins/teachers can sanity-check how the app
// looks to schools, parents or students. Stored in sessionStorage so it
// resets on tab close — prevents accidentally working-as-student for days.
const VIEW_AS_KEY = 'rillcod_view_as_role';

/**
 * Returns the simulated role ONLY if the actual role is allowed to
 * simulate it. Enforces a one-way hierarchy:
 *   admin   → admin | teacher | school | parent | student
 *   teacher → teacher | school | parent | student
 *   others  → (no simulation at all)
 */
function resolveViewAsRole(actualRole: UserRole | null | undefined, requested: UserRole | null): UserRole | null {
  if (!requested) return null;
  if (requested === actualRole) return null; // not really simulating
  if (actualRole === 'admin') return requested;
  if (actualRole === 'teacher' && requested !== 'admin') return requested;
  return null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Singleton — one client for the entire browser session
const supabase = createClient();

// Simple in-memory profile cache to avoid redundant DB fetches
const profileCache = new Map<string, { data: UserProfile; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Read stored user from localStorage synchronously — Supabase persists the
// session there, so we can show the correct UI on the very first render
// without waiting for any async getSession() call.
function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const key = Object.keys(localStorage).find(
      k => k.startsWith('sb-') && k.endsWith('-auth-token')
    );
    if (!key) return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Treat expired tokens as absent — Supabase will refresh them async
    const exp: number = parsed?.expires_at ?? 0;
    if (exp && Date.now() / 1000 > exp + 60) return null;
    return (parsed?.user as User) ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const storedUser = useRef(getStoredUser());

  const [user, setUser] = useState<User | null>(storedUser.current);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // ── View-as role simulation (UI-only) ─────────────────────────────
  const [viewAsRoleRaw, setViewAsRoleRaw] = useState<UserRole | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = sessionStorage.getItem(VIEW_AS_KEY);
    return (stored as UserRole | null) ?? null;
  });

  const setViewAsRole = useCallback((role: UserRole | null) => {
    if (typeof window !== 'undefined') {
      if (role) sessionStorage.setItem(VIEW_AS_KEY, role);
      else sessionStorage.removeItem(VIEW_AS_KEY);
    }
    setViewAsRoleRaw(role);
  }, []);

  // isLoading: true only while we don't yet know if a session exists.
  // If we found a stored user we already know — skip the spinner entirely.
  const [isLoading, setIsLoading] = useState(!storedUser.current);

  // profileLoading: true while the profile row is being fetched.
  // Allows consumers to distinguish "fetching" from "genuinely missing".
  const [profileLoading, setProfileLoading] = useState(!!storedUser.current);

  const mountedRef = useRef(true);

  // Tracks whether a profile fetch has been kicked off already for this session.
  // Prevents INITIAL_SESSION from double-fetching when storedUser fast-path runs first.
  const profileFetchStartedRef = useRef(false);

  // ── Profile fetch via API (service role — bypasses RLS) ───
  const fetchProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
    const cached = profileCache.get(userId);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

    // Retry only on network/server errors (not on empty profile — that means no account)
    // Keep delays short so normal users never notice the retry path
    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [0, 400, 900]; // ms between retries (total max ~1.3 s)

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
      }
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8_000);

        const res = await apiFetch('/api/auth/me', { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) {
          // 401 = cookie not yet propagated after fresh login → worth retrying
          if (res.status === 401 && attempt < MAX_RETRIES - 1) continue;
          return null;
        }
        const json = await res.json();
        if (!json.profile) {
          // 200 but no profile = account genuinely missing; one quick retry in case
          // the auto-heal in /api/auth/me races with the insert
          if (attempt === 0) continue;
          return null;
        }

        const p = json.profile as UserProfile;
        profileCache.set(userId, { data: p, ts: Date.now() });
        return p;
      } catch {
        if (attempt < MAX_RETRIES - 1) continue;
        return null;
      }
    }
    return null;
  }, []);

  const invalidateCache = useCallback((userId?: string) => {
    if (userId) profileCache.delete(userId);
    else profileCache.clear();
  }, []);

  // ── Public refresh ─────────────────────────────────────────
  const refreshProfile = useCallback(async () => {
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) { setProfile(null); return; }
      invalidateCache(u.id);
      setProfileLoading(true);
      const p = await fetchProfile(u.id);
      if (mountedRef.current) {
        setProfile(p);
        setProfileLoading(false);
      }
    } catch {
      if (mountedRef.current) {
        setProfile(null);
        setProfileLoading(false);
      }
    }
  }, [fetchProfile, invalidateCache]);

  // ── Sign out — clear everything, then navigate ────────────
  const signOut = useCallback(async () => {
    setUser(null);
    setSession(null);
    setProfile(null);
    setProfileLoading(false);
    invalidateCache();
    
    try { 
      await supabase.auth.signOut();
      if (typeof window !== 'undefined') {
        const keys = Object.keys(localStorage);
        keys.forEach(k => { if (k.startsWith('sb-')) localStorage.removeItem(k); });
        sessionStorage.clear();
      }
    } catch { /* ignore */ }
    
    // Hard navigate with clear=1 to ensure the login page clears its own client
    window.location.href = '/login?clear=1';
  }, [invalidateCache]);

  // ── Main init ─────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    // Fast path: if we pre-seeded user from localStorage, kick off the
    // profile fetch immediately without waiting for onAuthStateChange.
    // Mark the fetch as started so INITIAL_SESSION doesn't duplicate it.
    if (storedUser.current) {
      const fastPathUserId = storedUser.current.id;
      profileFetchStartedRef.current = true;
      setProfileLoading(true);
      fetchProfile(fastPathUserId).then(p => {
        // Apply immediately — onAuthStateChange INITIAL_SESSION will fire shortly
        // after and will clear the profile if the user has changed. Avoid the nested
        // supabase.auth.getUser() call here because it can hang indefinitely and
        // prevent setProfileLoading(false) from ever being called.
        if (mountedRef.current) {
          setProfile(p);
          setProfileLoading(false);
        }
      }).catch(() => {
        if (mountedRef.current) setProfileLoading(false);
      });
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        if (!mountedRef.current) return;

        setSession(s);
        setUser(s?.user ?? null);

        // Resolve the auth loading gate immediately — we now know the session state.
        // Do NOT wait for the profile DB fetch to finish before clearing isLoading.
        if (mountedRef.current) setIsLoading(false);

        if (s?.user) {
          if (event === 'SIGNED_IN') {
            // If a DIFFERENT user signed in while we're NOT on the login page
            // (e.g. session replaced in background), reload so all stale
            // component state is cleared. The login page handles its own
            // navigation after sign-in so skip the reload there.
            const prevId = storedUser.current?.id;
            const onLoginPage = typeof window !== 'undefined' &&
              window.location.pathname.startsWith('/login');
            if (prevId && prevId !== s.user.id && !onLoginPage) {
              window.location.reload();
              return;
            }

            // Fresh sign-in — clear ALL cached profiles so no stale data
            // from the previous user is ever served during the transition
            setProfile(null);
            invalidateCache();
            profileFetchStartedRef.current = true;
            setProfileLoading(true);
            const p = await fetchProfile(s.user.id);
            if (mountedRef.current) {
              setProfile(p);
              setProfileLoading(false);
            }
          } else if (!profileFetchStartedRef.current) {
            // INITIAL_SESSION (or any other event) when storedUser fast-path
            // has NOT already started a fetch — fetch now.
            profileFetchStartedRef.current = true;
            setProfileLoading(true);
            const p = await fetchProfile(s.user.id);
            if (mountedRef.current) {
              setProfile(p);
              setProfileLoading(false);
            }
          }
          // else: storedUser fast-path is already handling the fetch — skip.
        } else {
          // Signed out
          setProfile(null);
          setProfileLoading(false);
          profileFetchStartedRef.current = false;
          invalidateCache();
        }
      }
    );

    const handleStorage = () => {
      // If a different user's session appeared in localStorage (e.g. another
      // tab logged in as someone else), reload the page completely so all
      // component state is cleared and the new user's data loads fresh.
      const stored = getStoredUser();
      if (stored?.id && stored.id !== storedUser.current?.id) {
        window.location.reload();
      } else {
        refreshProfile();
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
      window.removeEventListener('storage', handleStorage);
    };
  }, [fetchProfile, invalidateCache, refreshProfile]);

  // If auth never resolves (e.g. rare Supabase client stall), don't leave the
  // app on "Loading…" forever — recover via getSession() after a few seconds.
  useEffect(() => {
    if (!isLoading) return;
    const t = window.setTimeout(() => {
      if (!mountedRef.current) return;
      void supabase.auth.getSession().then(({ data: { session: s } }) => {
        if (!mountedRef.current) return;
        setSession(s);
        setUser(s?.user ?? null);
        setIsLoading(false);
        if (s?.user && !profileFetchStartedRef.current) {
          profileFetchStartedRef.current = true;
          setProfileLoading(true);
          void fetchProfile(s.user.id)
            .then((p) => {
              if (mountedRef.current) {
                setProfile(p);
                setProfileLoading(false);
              }
            })
            .catch(() => {
              if (mountedRef.current) setProfileLoading(false);
            });
        } else if (!s?.user) {
          setProfile(null);
          setProfileLoading(false);
        }
      });
    }, 12_000);
    return () => window.clearTimeout(t);
  }, [isLoading, fetchProfile]);

  // Apply the view-as override if we're allowed to. `actualRole` is always
  // the real JWT/DB role; `profile.role` is what the UI sees.
  const actualRole = profile?.role ?? null;
  const effectiveViewAsRole = resolveViewAsRole(actualRole, viewAsRoleRaw);
  const effectiveProfile = useMemo<UserProfile | null>(() => {
    if (!profile) return profile;
    if (!effectiveViewAsRole) return profile;
    return { ...profile, role: effectiveViewAsRole };
  }, [profile, effectiveViewAsRole]);

  // Clear simulation automatically when the actual role can no longer use it
  // (sign-in as a different user, role downgrade, etc.)
  useEffect(() => {
    if (viewAsRoleRaw && !resolveViewAsRole(actualRole, viewAsRoleRaw)) {
      setViewAsRole(null);
    }
  }, [actualRole, viewAsRoleRaw, setViewAsRole]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      session,
      profile: effectiveProfile,
      actualRole,
      viewAsRole: effectiveViewAsRole,
      isSimulating: !!effectiveViewAsRole,
      setViewAsRole,
      isLoading,
      loading: isLoading,
      profileLoading,
      signOut,
      refreshProfile,
      login: async (email: string, password: string) => {
        try {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (error || !data?.user) return false;
          setSession(data.session ?? null);
          setUser(data.user);
          invalidateCache(data.user.id);
          profileFetchStartedRef.current = true;
          setProfileLoading(true);
          const p = await fetchProfile(data.user.id);
          if (mountedRef.current) {
            setProfile(p);
            setProfileLoading(false);
          }
          return true;
        } catch {
          return false;
        }
      },
    }),
    [user, session, effectiveProfile, actualRole, effectiveViewAsRole, setViewAsRole, isLoading, profileLoading, signOut, refreshProfile, fetchProfile, invalidateCache],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
