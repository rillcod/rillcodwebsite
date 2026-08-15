"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { createClient } from '@/lib/supabase/client';
import {
  Mail, Lock, Eye, EyeOff, User, GraduationCap,
  Shield, Building2, Heart, ArrowRight, Loader2,
  Sparkles, AlertCircle, CheckCircle2, QrCode, KeyRound
} from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from 'next/link';
import Image from 'next/image';

import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import { isCapacitorNative } from "@/lib/capacitor/platform";
import { PUBLIC_PAGE_ROOT, PUBLIC_SAFE_INSET, PUBLIC_AMBIENT_BG } from "@/components/mobile/public-styles";
import { withTimeoutOrThrow } from '@/lib/async-timeout';
import { readPostLoginRedirectParam } from '@/lib/auth/post-login-redirect';

const ROLES = [
  { id: "student", icon: GraduationCap, title: "Student",  subtitle: "Courses & CBT Lab", color: "from-cyan-500 to-blue-600", border: "border-cyan-500/30", text: "text-cyan-600 dark:text-cyan-400" },
  { id: "teacher", icon: User,           title: "Teacher",  subtitle: "Syllabus & Roll",    color: "from-violet-500 to-purple-600", border: "border-violet-500/30", text: "text-violet-600 dark:text-violet-400" },
  { id: "parent",  icon: Heart,          title: "Parent",   subtitle: "Progress & Bills",   color: "from-pink-500 to-rose-600", border: "border-pink-500/30", text: "text-pink-600 dark:text-pink-400" },
  { id: "school",  icon: Building2,      title: "School",   subtitle: "Roster & Reports",   color: "from-emerald-500 to-teal-600", border: "border-emerald-500/30", text: "text-emerald-600 dark:text-emerald-400" },
  { id: "admin",   icon: Shield,         title: "Admin",    subtitle: "Security & Control", color: "from-blue-600 to-indigo-700", border: "border-blue-500/30", text: "text-blue-600 dark:text-blue-400" },
] as const;

type Role = "student" | "teacher" | "admin" | "school" | "parent";

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
  const [clearingSession, setClearingSession] = useState(
    () => searchParams?.get("clear") === "1" || searchParams?.get("signed_out") === "1"
  );
  const [signedOutNotice, setSignedOutNotice] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const type = searchParams?.get("type") as Role | null;
    if (type && ROLES.some(r => r.id === type)) setSelectedRole(type);

    const emailParam = searchParams?.get("email");
    if (emailParam) setEmail(decodeURIComponent(emailParam));

    const oauthError = searchParams?.get("oauth_error");
    if (oauthError) {
      setError(oauthError);
      setSelectedRole((prev) => prev ?? 'parent');
    }

    const clearParam = searchParams?.get("clear") === "1";
    const signedOutParam = searchParams?.get("signed_out") === "1";

    if (clearParam || signedOutParam) {
      setClearingSession(true);
      setEmail("");
      setPassword("");
      setSelectedRole(null);
      setError(null);

      void (async () => {
        try {
          // Extra clear for older links / leftover cookies
          await fetch('/api/auth/signout', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              Accept: 'application/json',
              'x-rillcod-signout': '1',
            },
            redirect: 'manual',
          }).catch(() => null);
          await supabase.auth.signOut({ scope: 'global' }).catch(() => null);
          try {
            Object.keys(localStorage).forEach((k) => {
              if (k.startsWith('sb-') || k.startsWith('rillcod_')) localStorage.removeItem(k);
            });
            sessionStorage.clear();
          } catch { /* ignore */ }
        } finally {
          setClearingSession(false);
          setSignedOutNotice(true);
          window.history.replaceState({}, '', '/login');
        }
      })();
      return;
    }

    // Already signed in (PWA / Capacitor cold start) → dashboard
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const redirectTo = readPostLoginRedirectParam(searchParams);
        window.location.replace(redirectTo);
      }
    });

    if (envMissing) setError("Configuration error. Please contact support.");
  }, []); // eslint-disable-line

  const handleGoogleParentLogin = async () => {
    if (envMissing) return;
    if (selectedRole !== 'parent') {
      setError('Select Parent, then continue with Google.');
      return;
    }
    setGoogleLoading(true);
    setError(null);
    try {
      const redirectTo = readPostLoginRedirectParam(searchParams);
      const callback = new URL('/auth/callback', window.location.origin);
      callback.searchParams.set('next', redirectTo);
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callback.toString(),
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });
      if (oauthError) throw oauthError;
    } catch (err: any) {
      setError(err?.message || 'Google sign-in failed. Please try again.');
      setGoogleLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (envMissing) return;
    if (!selectedRole) { setError("Please choose your role above before signing in."); return; }

    setLoading(true);
    setError(null);

    try {
      const { data: authData, error: authError } =
        await withTimeoutOrThrow(
          supabase.auth.signInWithPassword({ email, password }),
          'Sign in is taking longer than expected. Check your connection and try again.',
          15_000,
        );

      if (authError) throw authError;
      if (!authData?.user) throw new Error("Sign in failed. Please try again.");

      const { data: profileData, error: profileError } = await withTimeoutOrThrow(
        supabase
          .from('portal_users')
          .select('role, is_active, full_name, metadata, school_id, class_id')
          .eq('id', authData.user.id)
          .maybeSingle(),
        'Your account details could not be confirmed. Please try again.',
        12_000,
      );

      if (profileError) throw profileError;
      if (!profileData) {
        await supabase.auth.signOut();
        throw new Error("No account found. Please contact your school administrator.");
      }
      if (!profileData.is_active) {
        await supabase.auth.signOut();
        const role = profileData.role ?? '';
        const needsSchool = ['student', 'parent', 'teacher', 'school'].includes(role) && !profileData.school_id;
        const needsClass = role === 'student' && !profileData.class_id;
        if (needsSchool || needsClass) {
          throw new Error(
            needsClass
              ? 'Your account is pending class placement. Ask your school or teacher to assign you to a class.'
              : role === 'teacher'
                ? 'Your account is pending school placement. Ask a Rillcod admin to assign your school(s).'
                : 'Your account is pending school placement. Ask your school or admin to assign your school.',
          );
        }
        throw new Error("Your account is inactive. Please contact support.");
      }

      // Active legacy accounts must still satisfy structural placement rules
      const role = profileData.role ?? '';
      const needsSchool = ['student', 'parent', 'teacher', 'school'].includes(role) && !profileData.school_id;
      const needsClass = role === 'student' && !profileData.class_id;
      if (needsSchool || needsClass) {
        await supabase.auth.signOut();
        throw new Error(
          needsClass
            ? 'Your account is pending class placement. Ask your school or teacher to assign you to a class.'
            : role === 'teacher'
              ? 'Your account is pending school placement. Ask a Rillcod admin to assign your school(s).'
              : 'Your account is pending school placement. Ask your school or admin to assign your school.',
        );
      }

      if (profileData.role !== selectedRole) {
        await supabase.auth.signOut();
        throw new Error(`Wrong role selected. Your account is registered as "${profileData.role}". Please tap "${profileData.role}" above.`);
      }

      // Audit Log: Track native app vs web logins
      try {
        const isNative = isCapacitorNative();
        const loginPlatform = isNative ? 'Android App' : 'Web Browser';
        await withTimeoutOrThrow(Promise.all([
          supabase.from('crm_interactions').insert({
            contact_id: authData.user.id,
            contact_name: profileData.full_name || email,
            contact_type: profileData.role === 'parent' ? 'parent' : profileData.role === 'student' ? 'student' : 'staff',
            type: 'app_login',
            direction: 'inbound',
            content: isNative
              ? 'Logged in from the native Android mobile application.'
              : 'Logged in from the web browser.',
            created_at: new Date().toISOString(),
          }),
          supabase.rpc('merge_my_metadata' as never, {
            patch: {
              last_login_platform: loginPlatform,
              last_login_at: new Date().toISOString(),
            },
            increment_keys: [isNative ? 'app_login_count' : 'web_login_count'],
            stamp_login: true,
          } as never),
        ]), 'Login audit deferred', 1_500);

      } catch (crmErr) {
        console.error('Failed to log login audit:', crmErr);
      }

      const redirectTo = readPostLoginRedirectParam(searchParams);
      window.location.href = redirectTo;

    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.toLowerCase().includes('invalid login credentials') || msg.toLowerCase().includes('invalid credentials')) {
        setError('Incorrect email or password. Please check your spelling and try again.');
      } else if (msg.toLowerCase().includes('email not confirmed')) {
        setError('Please confirm your email address before signing in.');
      } else if (msg.toLowerCase().includes('too many requests')) {
        setError('Too many login attempts. Please wait a moment and try again.');
      } else {
        setError(msg || 'Sign in failed. Please check your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  const activeRole = ROLES.find(r => r.id === selectedRole);

  if (clearingSession) {
    return (
      <div className="min-h-dvh bg-background text-foreground flex items-center justify-center px-6 public-page-root overflow-x-clip">
        <div
          className="w-full max-w-sm rounded-3xl border border-border bg-card p-8 text-center shadow-2xl space-y-4"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="mx-auto h-10 w-10 rounded-full border-3 border-brand-red-600/30 border-t-brand-red-600 animate-spin" />
          <h2 className="text-base font-bold text-foreground">Signing you out securely…</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">Clearing credentials and terminating active portal sessions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${PUBLIC_PAGE_ROOT} min-h-screen flex flex-col items-center justify-center ${PUBLIC_SAFE_INSET} px-4 py-8 sm:p-6 lg:p-12 relative font-sans transition-colors duration-500 bg-background text-foreground overflow-hidden`}>
      {/* ── Ambient Background Visual Gradients ── */}
      <div className={PUBLIC_AMBIENT_BG} aria-hidden>
        <div className="public-ambient-orb top-1/4 -left-28 w-[650px] h-[650px] bg-brand-blue/15 dark:bg-brand-blue/10 blur-3xl" />
        <div className="public-ambient-orb bottom-1/4 -right-28 w-[550px] h-[550px] bg-brand-red-600/10 dark:bg-brand-red-600/5 blur-3xl [animation-delay:-6s]" />
      </div>

      <div className="w-full max-w-5xl mx-auto relative z-10">
        {signedOutNotice && (
          <div
            role="status"
            className="mb-6 mx-auto max-w-xl rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3.5 text-center flex items-center justify-center gap-2.5 shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <p className="text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-300">
              You have been successfully signed out. Sign in below to access your workspace.
            </p>
          </div>
        )}

        {/* ── Main Dual-Panel Auth Card ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-center">
          
          {/* ── Left Section: Institutional Branding & Trust ── */}
          <div className="lg:col-span-5 flex flex-col justify-center text-center lg:text-left space-y-6">
            <Link
              href={isNativeApp ? '/login' : '/'}
              aria-label={isNativeApp ? 'Rillcod portal login' : 'Rillcod home'}
              className="flex items-center gap-4 group w-fit mx-auto lg:mx-0 transition-transform active:scale-95"
            >
              {/* The white plate stays: the mark has white counters on transparent,
                  so on a dark surface its inner shapes fill in and it reads wrong.
                  The border is neutral rather than a fixed slate, because it sits
                  on white in both themes. */}
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white shadow-md border border-black/10 p-2 flex items-center justify-center group-hover:shadow-xl transition-all">
                <Image src="/images/logo.png" alt="Rillcod" width={64} height={64} className="object-contain w-full h-full" />
              </div>
              <div className="text-left leading-tight">
                <span className="text-2xl sm:text-3xl font-black tracking-tight block text-foreground">
                  RILLCOD<span className="text-brand-red-600">.</span>
                </span>
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground block mt-0.5">Technologies</span>
              </div>
            </Link>

            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-brand-blue/10 dark:bg-brand-blue/20 border border-brand-blue/20 rounded-full text-brand-blue dark:text-blue-400">
                <Shield className="w-3.5 h-3.5" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Institutional Secure Gateway</span>
              </div>

              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black leading-tight tracking-tight text-foreground">
                Sign in to your learning workspace
              </h1>

              <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto lg:mx-0">
                Select your account role to access live STEM syllabi, practical code assignments, CBT assessments, and verified reports.
              </p>
            </div>

            {/* Quick Result Check Action */}
            <div className="hidden sm:flex items-center gap-3 p-3.5 rounded-2xl border border-border/80 bg-card/60 backdrop-blur-sm shadow-sm text-left">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 text-amber-600 dark:text-amber-400">
                <QrCode className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-foreground">Have a Student Access Card?</p>
                <p className="text-[11px] text-muted-foreground">Check official term results instantly with zero login needed.</p>
              </div>
              <Link
                href="/result-check"
                className="shrink-0 px-3 py-1.5 text-xs font-bold rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 transition-colors"
              >
                Check Result →
              </Link>
            </div>
          </div>

          {/* ── Right Section: Role Chooser & Authentication Form ── */}
          <div className="lg:col-span-7 w-full">
            <div className="bg-card/95 backdrop-blur-xl border border-border rounded-3xl overflow-hidden shadow-2xl">
              
              {/* Role Header / Chooser Tabs */}
              <div className="p-4 sm:p-6 border-b border-border/80 bg-muted/20">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="text-xs font-black uppercase tracking-wider text-muted-foreground">Step 1: Choose Role</h2>
                    <p className="text-sm font-bold text-foreground">Select your portal account type</p>
                  </div>
                  {activeRole && (
                    <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                      <activeRole.icon className="w-3.5 h-3.5" />
                      {activeRole.title}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {ROLES.map((role) => {
                    const Icon = role.icon;
                    const isActive = selectedRole === role.id;
                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => { setSelectedRole(role.id as Role); setError(null); }}
                        aria-pressed={isActive}
                        className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all duration-200 group text-center min-h-[72px] ${
                          isActive
                            ? 'bg-primary border-primary text-white shadow-md shadow-primary/25 ring-2 ring-primary/20 scale-[1.02]'
                            : 'bg-card border-border text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-muted/30'
                        }`}
                      >
                        <Icon className={`w-5 h-5 mb-1.5 transition-transform group-hover:scale-110 ${isActive ? 'text-white' : role.text}`} />
                        <span className="text-xs font-black tracking-tight">{role.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Form Body */}
              <div className="p-5 sm:p-8">
                {error && (
                  <div
                    role="alert"
                    aria-live="polite"
                    className="mb-5 bg-destructive/10 border border-destructive/20 rounded-2xl p-4 flex items-start gap-3"
                  >
                    <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                    <p className="text-sm font-semibold text-destructive leading-snug">{error}</p>
                  </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                  {/* Email Field */}
                  <div className="space-y-1.5">
                    <label htmlFor="login-email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground pl-1">
                      Email address
                    </label>
                    <div className="relative group">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
                      <input
                        id="login-email"
                        name="email"
                        type="email"
                        autoComplete="username"
                        inputMode="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="yourname@school.com"
                        className="w-full bg-background border border-border rounded-2xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/40 text-foreground"
                      />
                    </div>
                  </div>

                  {/* Password Field */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between pl-1">
                      <label htmlFor="login-password" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Password
                      </label>
                      <Link
                        href="/reset-password"
                        className="text-xs font-bold text-primary hover:underline transition-all"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
                      <input
                        id="login-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        autoCapitalize="none"
                        spellCheck={false}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-background border border-border rounded-2xl pl-11 pr-12 py-3.5 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/40 text-foreground"
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Sign In CTA */}
                  <button
                    type="submit"
                    disabled={loading || googleLoading || !selectedRole}
                    className="w-full min-h-[48px] py-4 bg-primary text-primary-foreground font-black text-sm uppercase tracking-wider rounded-2xl hover:bg-primary/95 transition-all transform active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2.5 shadow-lg shadow-primary/20 mt-2"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Verifying account…</span>
                      </>
                    ) : (
                      <>
                        <span>Sign In to {activeRole ? activeRole.title : 'Workspace'}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  {/* Google Sign-In for Parents */}
                  {selectedRole === 'parent' && (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">or</span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleGoogleParentLogin()}
                        disabled={loading || googleLoading}
                        className="w-full min-h-[48px] py-3.5 bg-background border-2 border-border text-foreground font-bold text-xs rounded-2xl hover:border-primary/50 hover:bg-muted/40 transition-all disabled:opacity-40 flex items-center justify-center gap-3 shadow-sm"
                      >
                        {googleLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Connecting to Google…</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden>
                              <path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.2-1.9 2.9l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7 0-.7-.1-1.3-.2-1.9H12z" />
                              <path fill="#34A853" d="M12 22c2.6 0 4.8-.9 6.4-2.3l-3.1-2.4c-.9.6-2 .9-3.3.9-2.5 0-4.6-1.7-5.4-4l-3.2 2.5C5.1 19.8 8.3 22 12 22z" />
                              <path fill="#4A90E2" d="M6.6 14.2c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9L3.4 8C2.6 9.5 2.2 11.1 2.2 12.8c0 1.7.4 3.3 1.2 4.7l3.2-2.5z" />
                              <path fill="#FBBC05" d="M12 5.8c1.4 0 2.7.5 3.7 1.4l2.8-2.8C16.8 2.8 14.6 2 12 2 8.3 2 5.1 4.2 3.4 7.5l3.2 2.5c.8-2.3 2.9-4.2 5.4-4.2z" />
                            </svg>
                            <span>Continue with Google</span>
                          </>
                        )}
                      </button>
                      <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
                        Use the Google account registered with your student&apos;s school.
                      </p>
                    </div>
                  )}

                  {/* Native App Enrollment Banner */}
                  {isNativeApp && (
                    <div className="mt-6 pt-5 border-t border-border/60 text-center space-y-2">
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">New to Rillcod Technologies?</p>
                      <Link
                        href="/student-registration"
                        className="inline-flex items-center justify-center gap-2 px-6 py-3 w-full bg-gradient-to-r from-cyan-500 to-primary text-white font-black text-xs uppercase tracking-wider rounded-2xl hover:scale-[1.01] active:scale-[0.99] transition-all shadow-md shadow-primary/10"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Enrol Student Online →</span>
                      </Link>
                    </div>
                  )}
                </form>

                {/* Footer Portal Links */}
                <div className="mt-6 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs">
                  {!isNativeApp && (
                    <Link href="/" className="font-bold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
                      ← Back to Home
                    </Link>
                  )}
                  <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground ml-auto">
                    <Link href="/partnership" className="hover:text-primary transition-colors">
                      School Partnership
                    </Link>
                    <span>·</span>
                    <Link href="/result-check" className="hover:text-primary transition-colors">
                      Check Results
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Page Footer ── */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-muted-foreground/60 text-[10px] font-bold uppercase tracking-widest">
          <div className="flex items-center gap-4">
            <span>© {new Date().getFullYear()} Rillcod Technologies</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              256-bit SSL Encrypted
            </span>
          </div>
          <div className="flex gap-6">
            <Link href="/privacy-policy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link href="/terms-of-service" className="hover:text-foreground transition-colors">Terms of Service</Link>
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
