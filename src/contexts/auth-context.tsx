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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
    // Clear local state first for instant UI response
    setUser(null);
    setSession(null);
    setProfile(null);
    invalidateCache();
    // Await signOut so the session cookie is cleared BEFORE the
    // browser navigates. Without this the middleware sees a still-valid
    // cookie on the /login page and redirects back to /dashboard.
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    window.location.href = '/login';
  }, [invalidateCache]);

  // ── Main init ─────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      try {
        // getSession() reads from localStorage — no network round trip for valid sessions.
        // Falls back to network only if tokens are expired.
        const { data: { session: s } } = await supabase.auth.getSession();

        if (!mountedRef.current) return;

        if (s?.user) {
          setSession(s);
          setUser(s.user);
          // Clear loading immediately once we know the user — unblocks the UI.
          // Profile fetches in the background; dashboard handles !profile gracefully.
          if (mountedRef.current) setIsLoading(false);
          const p = await fetchProfile(s.user.id);
          if (mountedRef.current) setProfile(p);
        } else {
          if (mountedRef.current) setIsLoading(false);
        }
      } catch {
        if (mountedRef.current) setIsLoading(false);
      }
    };

    init();

    // Listen for future auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        if (!mountedRef.current) return;
        if (event === 'INITIAL_SESSION') return; // handled by init()

        setSession(s);
        setUser(s?.user ?? null);

        if (s?.user) {
          // Invalidate cache on sign-in/token-refresh so we get fresh profile
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            invalidateCache(s.user.id);
          }
          const p = await fetchProfile(s.user.id);
          if (mountedRef.current) setProfile(p);
        } else {
          setProfile(null);
          invalidateCache();
        }

        if (mountedRef.current) setIsLoading(false);
      }
    );

    const handleStorage = () => {
      // Supabase syncs session via storage; refresh local profile on changes.
      refreshProfile();
    };
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
