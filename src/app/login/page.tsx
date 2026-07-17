"use client";

import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/logger';
import {
  Mail, Lock, Eye, EyeOff, User, GraduationCap,
  Shield, Building2, Heart, ArrowRight, Loader2,
  ArrowLeft, Sparkles, AlertCircle
} from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from 'next/link';
import Image from 'next/image';

import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import { isCapacitorNative } from "@/lib/capacitor/platform";

const ROLES = [
  { id: "student", icon: GraduationCap, title: "Student",  color: "text-cyan-500"   },
  { id: "teacher", icon: User,           title: "Teacher",  color: "text-violet-500" },
  { id: "parent",  icon: Heart,          title: "Parent",   color: "text-pink-500"   },
  { id: "school",  icon: Building2,      title: "School",   color: "text-emerald-500"},
  { id: "admin",   icon: Shield,         title: "Admin",    color: "text-primary" },
] as const;

type Role = "student" | "teacher" | "admin" | "school" | "parent";

function safeDashboardRedirect(value: string | null) {
  if (!value || !value.startsWith('/dashboard') || value.startsWith('//')) return '/dashboard';
  return value;
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const envMissing = useMemo(
    () => !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    []
  );

  const isNativeApp = useIsNativeApp();
  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const type = searchParams?.get("type") as Role | null;
    if (type && ROLES.some(r => r.id === type)) setSelectedRole(type);

    const emailParam = searchParams?.get("email");
    if (emailParam) setEmail(decodeURIComponent(emailParam));

    if (searchParams?.get("clear") === "1") {
      supabase.auth.signOut().then(() => {
        window.location.replace('/login');
      });
      setEmail(""); setPassword(""); setSelectedRole(null); setError(null);
      return;
    }

    // Already signed in (PWA / Capacitor cold start) → dashboard
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const redirectTo = safeDashboardRedirect(searchParams?.get('redirectedFrom'));
        window.location.replace(redirectTo);
      }
    });

    if (envMissing) setError("Configuration error. Please contact support.");
    return () => abortRef.current?.abort();
  }, []); // eslint-disable-line

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (envMissing) return;
    if (!selectedRole) { setError("Please select your role to continue."); return; }

    setLoading(true);
    setError(null);
    abortRef.current = new AbortController();
    const timeout = setTimeout(() => abortRef.current?.abort(), 12000);

    try {
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({ email, password });
      clearTimeout(timeout);

      if (authError) throw authError;
      if (!authData?.user) throw new Error("Sign in failed. Please try again.");

      const { data: profileData, error: profileError } = await supabase
        .from('portal_users')
        .select('role, is_active, full_name, metadata')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profileData) {
        await supabase.auth.signOut();
        throw new Error("No account found. Please contact your administrator.");
      }
      if (!profileData.is_active) {
        await supabase.auth.signOut();
        throw new Error("Your account is inactive. Please contact support.");
      }
      if (profileData.role !== selectedRole) {
        await supabase.auth.signOut();
        throw new Error(`Wrong role selected. Please choose "${profileData.role}".`);
      }

      // Audit Log: Track native app vs web logins
      try {
        const isNative = isCapacitorNative();
        
        // 1. Log the login event in the CRM timeline
        await supabase.from('crm_interactions').insert({
          contact_id:   authData.user.id,
          contact_name: profileData.full_name || email,
          contact_type: profileData.role === 'parent' ? 'parent' : 'student',
          type:         'app_login',
          direction:    'inbound',
          content:      isNative 
            ? 'Logged in from the native Android mobile application.' 
            : 'Logged in from the web browser.',
          created_at:   new Date().toISOString(),
        });

        // 2. Update metadata with login stats (total count and last active platform)
        const currentMeta = (profileData.metadata as Record<string, any>) || {};
        const loginPlatform = isNative ? 'Android App' : 'Web Browser';
        const updatedMeta = {
          ...currentMeta,
          last_login_platform: loginPlatform,
          last_login_at: new Date().toISOString(),
          app_login_count: isNative 
            ? (Number(currentMeta.app_login_count || 0) + 1) 
            : Number(currentMeta.app_login_count || 0),
          web_login_count: !isNative 
            ? (Number(currentMeta.web_login_count || 0) + 1) 
            : Number(currentMeta.web_login_count || 0),
        };

        await supabase
          .from('portal_users')
          .update({ metadata: updatedMeta })
          .eq('id', authData.user.id);

      } catch (crmErr) {
        console.error('Failed to log native app login audit:', crmErr);
      }

      const redirectTo = safeDashboardRedirect(searchParams?.get('redirectedFrom'));
      window.location.href = redirectTo;

    } catch (err: any) {
      clearTimeout(timeout);
      const msg = err?.message || '';
      if (msg.toLowerCase().includes('invalid login credentials') || msg.toLowerCase().includes('invalid credentials')) {
        setError('Incorrect email or password. Please try again.');
      } else if (msg.toLowerCase().includes('email not confirmed')) {
        setError('Please confirm your email address before signing in.');
      } else if (msg.toLowerCase().includes('too many requests')) {
        setError('Too many attempts. Please wait a moment and try again.');
      } else {
        setError(msg || 'Sign in failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const activeRole = ROLES.find(r => r.id === selectedRole);

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col items-center justify-center px-[max(0.75rem,var(--safe-area-left))] pt-[max(0.75rem,var(--safe-area-top))] pb-[max(0.75rem,var(--safe-area-bottom))] sm:p-6 lg:p-10 relative overflow-hidden font-sans transition-colors duration-500">
      {/* ── Background Effects ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute top-1/4 -left-20 w-[600px] h-[600px] rounded-full bg-primary/10 dark:bg-primary/5 blur-[160px] animate-pulse" />
        <div className="absolute bottom-1/4 -right-20 w-[500px] h-[500px] rounded-full bg-brand-red-600/5 dark:bg-brand-red-600/5 blur-[140px] animate-pulse [animation-delay:2s]" />
      </div>

      <div className="w-full max-w-7xl mx-auto relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-20 items-center">
          
          {/* ── Left Section: Brand ── */}
          <div className="lg:col-span-5 flex flex-col justify-center py-2 sm:py-4 lg:py-12 text-center lg:text-left">
            <Link href={isNativeApp ? '/login' : '/'} aria-label={isNativeApp ? 'Rillcod portal login' : 'Rillcod home'} className="flex items-center gap-3 sm:gap-5 group w-fit mx-auto lg:mx-0 mb-4 sm:mb-8 lg:mb-16 transition-all hover:scale-[0.98]">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center dark:bg-white dark:shadow-md dark:border dark:border-white/20 group-hover:shadow-xl transition-all">
                <Image src="/images/logo.png" alt="Rillcod" width={80} height={80} className="object-contain w-[85%] h-[85%]" />
              </div>
              <div className="leading-tight">
                <span className="text-3xl sm:text-4xl font-black uppercase tracking-tighter block italic text-foreground">
                  RILLCOD<span className="not-italic text-brand-red-600">.</span>
                </span>
                <span className="text-sm sm:text-base font-black uppercase tracking-[0.2em] text-muted-foreground block mt-0.5">Technologies</span>
              </div>
            </Link>

            <div className="space-y-3 sm:space-y-6 lg:space-y-10">
              <div className="inline-flex items-center gap-2 sm:gap-3 px-3 py-1 sm:py-2 bg-brand-red-600/10 border border-brand-red-600/20 rounded-full">
                <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-brand-red-600" />
                <span className="text-[8px] sm:text-[10px] font-black text-brand-red-600 uppercase tracking-widest leading-none">Student Portal</span>
              </div>

              <h1 className="text-4xl sm:text-7xl lg:text-8xl font-black leading-[0.85] tracking-tighter uppercase italic text-foreground">
                SIGN IN<br />
                <span className="text-brand-red-600">TO LEARN.</span>
              </h1>

              <div className="hidden lg:block space-y-4 max-w-md">
                <p className="text-lg text-muted-foreground font-medium leading-relaxed">
                  Welcome back. Select your role and sign in to access your learning dashboard.
                </p>
                <div className="flex items-center gap-4 pt-4">
                  <div className="h-[2px] flex-1 bg-gradient-to-r from-brand-red-600/60 to-transparent" />
                  <span className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground">Rillcod Technologies</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Right Section: Login Form ── */}
          <div className="lg:col-span-7 w-full">
            <div className="bg-card/40 backdrop-blur-3xl border border-border rounded-[1.5rem] sm:rounded-[2.5rem] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.1)] dark:shadow-[0_40px_100px_rgba(0,0,0,0.3)]">
              <div className="grid grid-cols-1 md:grid-cols-2">
                
                {/* Role Selection */}
                <div className="p-4 sm:p-6 lg:p-10 border-b md:border-b-0 md:border-r border-border bg-muted/5">
                  <div className="mb-4 sm:mb-8 flex items-center justify-between md:block">
                    <div>
                      <h3 className="text-[10px] sm:text-xs font-black uppercase tracking-[0.25em] text-muted-foreground mb-1">Who are you?</h3>
                      <p className="text-[9px] sm:text-[11px] font-bold text-muted-foreground/50 uppercase tracking-[0.2em] whitespace-nowrap">Select your role</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-1 gap-2 sm:gap-2.5">
                    {ROLES.map((role) => {
                      const Icon = role.icon;
                      const isActive = selectedRole === role.id;
                      return (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => { setSelectedRole(role.id as Role); setError(null); }}
                          aria-pressed={isActive}
                          className={`flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 transition-all duration-300 group ${
                            isActive
                              ? 'bg-primary border-brand-red-600 text-white shadow-lg shadow-primary/20 ring-2 ring-brand-red-600/30'
                              : 'bg-background border-border text-muted-foreground hover:bg-muted/50 hover:border-primary/20'
                          }`}
                        >
                          <Icon className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 ${isActive ? 'text-white' : 'text-muted-foreground group-hover:text-foreground'}`} />
                          <span className="text-[9px] sm:text-[11px] font-black uppercase tracking-widest truncate">{role.title}</span>
                          {isActive && <div className="ml-auto w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-white animate-pulse" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Form */}
                <div className="p-4 sm:p-6 lg:p-10 flex flex-col justify-center bg-card">
                  {error && (
                    <div role="alert" aria-live="polite" className="mb-4 sm:mb-6 bg-destructive/10 border border-destructive/20 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-start gap-2 sm:gap-3">
                      <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 text-destructive shrink-0 mt-0.5" />
                      <p className="text-[9px] font-bold text-destructive leading-tight uppercase tracking-widest">{error}</p>
                    </div>
                  )}

                  <form onSubmit={handleLogin} className="space-y-4 sm:space-y-6">
                    <div className="space-y-1 sm:space-y-2">
                      <label htmlFor="login-email" className="text-[9px] sm:text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] pl-1">Email address</label>
                      <div className="relative group">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-brand-red-600 transition-colors pointer-events-none" />
                        <input
                          id="login-email"
                          name="email"
                          type="email"
                          autoComplete="username"
                          inputMode="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="your@email.com"
                          className="w-full bg-background border border-border rounded-xl sm:rounded-2xl pl-12 pr-4 py-3 sm:py-4 text-sm focus:outline-none focus:border-brand-red-600 focus:ring-2 focus:ring-brand-red-600/20 transition-all placeholder:text-muted-foreground/40 text-foreground"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 sm:space-y-2">
                      <label htmlFor="login-password" className="text-[9px] sm:text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em] pl-1">Password</label>
                      <div className="relative group">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-brand-red-600 transition-colors pointer-events-none" />
                        <input
                          id="login-password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="current-password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-background border border-border rounded-xl sm:rounded-2xl pl-12 pr-12 py-3 sm:py-4 text-sm focus:outline-none focus:border-brand-red-600 focus:ring-2 focus:ring-brand-red-600/20 transition-all placeholder:text-muted-foreground/40 text-foreground"
                        />
                        <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !selectedRole}
                      className="w-full py-4 sm:py-5 bg-primary text-white font-black text-xs uppercase tracking-[0.3em] rounded-xl sm:rounded-2xl hover:bg-primary border-2 border-transparent hover:border-brand-red-600 transition-all transform active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-3 shadow-lg shadow-primary/20"
                    >
                      {loading ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <>Sign In <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" /></>}
                    </button>

                    {isNativeApp && (
                      <div className="mt-8 pt-6 border-t border-border/40 text-center">
                        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-3">New to Rillcod Academy?</p>
                        <Link
                          href="/student-registration"
                          className="inline-flex items-center justify-center gap-2 px-6 py-3 w-full bg-gradient-to-r from-cyan-500 to-primary text-white font-black text-xs uppercase tracking-wider rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all shadow-md shadow-primary/10 hover:shadow-primary/20"
                        >
                          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                          Enrol a Learner Today →
                        </Link>
                      </div>
                    )}
                  </form>

                  <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-border flex items-center justify-between">
                    {isNativeApp ? (
                      <div className="w-10 h-2" />
                    ) : (
                      <Link href="/" className="text-[9px] sm:text-[10px] font-black text-muted-foreground hover:text-brand-red-600 uppercase tracking-widest transition-all flex items-center gap-2">
                        ← Back to Home
                      </Link>
                    )}
                    <div className="flex items-center gap-1.5 sm:gap-2 opacity-60">
                       <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-muted-foreground">Secure</span>
                       <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 sm:mt-12 flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6 text-muted-foreground/30 text-[8px] sm:text-[9px] font-black uppercase tracking-[0.4em]">
           <div className="flex items-center gap-6 sm:gap-8">
              <span>© Rillcod Technologies</span>
              <span className="hidden sm:block">Encrypted</span>
           </div>
           <div className="flex gap-6 sm:gap-10">
              <Link href="/privacy-policy" className="hover:text-brand-red-600 transition-colors">Privacy</Link>
              <Link href="/terms-of-service" className="hover:text-brand-red-600 transition-colors">Terms</Link>
              <span>Nigeria</span>
           </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
