'use client';

import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { UserProfile, AuthContextType } from '@/types';

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
  // Initialise synchronously from localStorage — eliminates the loading flash
  // for users who are already signed in.
  const storedUser = useRef(getStoredUser());
  const [user, setUser] = useState<User | null>(storedUser.current);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  // Skip the loading state entirely if we already have a user from localStorage
  const [isLoading, setIsLoading] = useState(!storedUser.current);
  const mountedRef = useRef(true);

  // ── Profile fetch with cache ───────────────────────────────
  const fetchProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
    const cached = profileCache.get(userId);
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

    try {
      const { data, error } = await supabase
        .from('portal_users')
        .select('id, email, full_name, role, is_active, phone, bio, profile_image_url, school_id, school_name, section_class, current_module, date_of_birth, created_at, updated_at')
        .eq('id', userId)
        .eq('is_active', true)
        .maybeSingle();

      if (error || !data) return null;
      const p = data as unknown as UserProfile;
      profileCache.set(userId, { data: p, ts: Date.now() });
      return p;
    } catch {
      return null;
    }
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
      const p = await fetchProfile(u.id);
      if (mountedRef.current) setProfile(p);
    } catch {
      if (mountedRef.current) setProfile(null);
    }
  }, [fetchProfile, invalidateCache]);

  // ── Sign out — clear everything, then navigate ────────────
  const signOut = useCallback(async () => {
    setUser(null);
    setSession(null);
    setProfile(null);
    invalidateCache();
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    window.location.href = '/login';
  }, [invalidateCache]);

  // ── Main init ─────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    // If we pre-seeded user from localStorage, kick off the profile fetch
    // immediately without waiting for onAuthStateChange.
    if (storedUser.current) {
      fetchProfile(storedUser.current.id).then(p => {
        if (mountedRef.current) setProfile(p);
      });
    }

    // onAuthStateChange validates the session server-side and fires
    // INITIAL_SESSION once ready. We use it to sync the authoritative state.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        if (!mountedRef.current) return;

        setSession(s);
        setUser(s?.user ?? null);

        if (s?.user) {
          // Invalidate cache on fresh sign-in or token refresh
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            invalidateCache(s.user.id);
          }
          // Always fetch profile when a session is present (covers INITIAL_SESSION
          // when storedUser was null — e.g. token was expired and Supabase refreshed it)
          const p = await fetchProfile(s.user.id);
          if (mountedRef.current) setProfile(p);
        } else {
          setProfile(null);
          invalidateCache();
        }

        if (mountedRef.current) setIsLoading(false);
      }
    );

    const handleStorage = () => { refreshProfile(); };
    window.addEventListener('storage', handleStorage);

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
      window.removeEventListener('storage', handleStorage);
    };
  }, [fetchProfile, invalidateCache, refreshProfile]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      session,
      profile,
      isLoading,
      loading: isLoading,
      signOut,
      refreshProfile,
      login: async (email: string, password: string) => {
        try {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (error || !data?.user) return false;
          setSession(data.session ?? null);
          setUser(data.user);
          invalidateCache(data.user.id);
          const p = await fetchProfile(data.user.id);
          setProfile(p);
          return true;
        } catch {
          return false;
        }
      },
    } as any),
    [user, session, profile, isLoading, signOut, refreshProfile, fetchProfile, invalidateCache],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
