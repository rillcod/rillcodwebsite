'use client';

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { UserProfile, AuthContextType } from '@/types';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Singleton client — created once for the entire app, not per render
const supabase = createClient();

// ─── Provider ──────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // ── Lean profile fetch — only the columns we actually need ────
  const fetchProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
    try {
      const { data } = await supabase
        .from('portal_users')
        .select('id, email, full_name, role, is_active, phone, profile_image_url, created_at, updated_at')
        .eq('id', userId)
        .maybeSingle();
      return (data as unknown as UserProfile) ?? null;
    } catch {
      return null;
    }
  }, []);

  // ── Public refresh ────────────────────────────────────────────
  const refreshProfile = useCallback(async () => {
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) { setProfile(null); return; }
      const p = await fetchProfile(u.id);
      setProfile(p);
    } catch {
      setProfile(null);
    }
  }, [fetchProfile]);

  // ── Sign out ──────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    setUser(null);
    setSession(null);
    setProfile(null);
  }, []);

  // ── Main init effect ──────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    // ── GUARANTEE: loading clears after 1.5 s no matter what ───
    const hardStop = setTimeout(() => {
      if (mounted) setIsLoading(false);
    }, 1500);

    const finish = () => {
      clearTimeout(hardStop);
      if (mounted) setIsLoading(false);
    };

    // ── Step 1: Initial session check ─────────────────────────
    const init = async () => {
      try {
        // getUser() validates the token — no stale session risk
        const { data: { user: u } } = await supabase.auth.getUser();
        if (!mounted) return;
        setUser(u);
        if (u) {
          // Fetch profile in parallel while we set user state
          const p = await fetchProfile(u.id);
          if (mounted) setProfile(p);
        }
      } catch {
        // silent — will fall through to hardStop
      } finally {
        finish();
      }
    };

    init();

    // ── Step 2: Listen for future auth state changes ───────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        if (!mounted) return;

        // Skip events that happen during init (handled above)
        if (event === 'INITIAL_SESSION') return;

        setSession(s);
        setUser(s?.user ?? null);

        try {
          if (s?.user) {
            const p = await fetchProfile(s.user.id);
            if (mounted) setProfile(p);
          } else {
            setProfile(null);
          }
        } catch {
          if (mounted) setProfile(null);
        }

        // Ensure loading is off after any auth event
        if (mounted) setIsLoading(false);
      }
    );

    return () => {
      mounted = false;
      clearTimeout(hardStop);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      session,
      profile,
      isLoading,
      loading: isLoading,
      signOut,
      refreshProfile,
      login: async () => { },
    } as any),
    [user, session, profile, isLoading, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────
export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}