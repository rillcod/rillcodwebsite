"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { createClient } from '@/lib/supabase/client';
import {
  Mail, Lock, Eye, EyeOff,
  Shield, ArrowRight, Loader2,
  AlertCircle, CheckCircle2, QrCode
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import Link from 'next/link';
import Image from 'next/image';

import { useIsNativeApp } from "@/hooks/useIsNativeApp";
import { isCapacitorNative } from "@/lib/capacitor/platform";
import { withTimeoutOrThrow, friendlyActionError } from '@/lib/async-timeout';
import { readPostLoginRedirectParam } from '@/lib/auth/post-login-redirect';
import {
  isInvalidRefreshTokenError,
  recoverInvalidBrowserSession,
} from '@/lib/auth/session-recovery';
import { PUBLIC_PAGE_ROOT, PUBLIC_SAFE_INSET } from '@/components/mobile/public-styles';

function LoginContent() {
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
  const [error, setError]               = useState<string | null>(null);
  const [clearingSession, setClearingSession] = useState(
    () => searchParams?.get("clear") === "1" || searchParams?.get("signed_out") === "1"
  );
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const emailParam = searchParams?.get("email");
    if (emailParam) setEmail(emailParam);

    const oauthError = searchParams?.get("oauth_error");
    if (oauthError) {
      setError(oauthError);
    }

    const clearParam = searchParams?.get("clear") === "1";
    const signedOutParam = searchParams?.get("signed_out") === "1";
    const sessionRecoveredParam = searchParams?.get('session_recovered') === '1';
    const sessionExpiredParam = searchParams?.get('session_expired') === '1';
    const profileMissing = searchParams?.get('account_error') === 'profile_missing';

    if (sessionRecoveredParam || sessionExpiredParam) {
      setSessionNotice(
        sessionExpiredParam
          ? 'Your previous session expired safely. Sign in again to continue.'
          : 'An expired session was cleared. You can sign in normally.',
      );
    }
    if (profileMissing) {
      setError('Your account setup could not be confirmed. Please contact your school or Rillcod support.');
    }

    if (clearParam || signedOutParam) {
      setClearingSession(true);
      setEmail("");
      setPassword("");
      setError(null);

      void (async () => {
        try {
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
          setSessionNotice('Signed out successfully.');
          window.history.replaceState({}, '', '/login');
        }
      })();
      return;
    }

    // Already signed in → dashboard
    void (async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (isInvalidRefreshTokenError(sessionError)) {
          setClearingSession(true);
          await recoverInvalidBrowserSession();
          setSessionNotice('Your previous session expired safely. Sign in again to continue.');
          setClearingSession(false);
          return;
        }
        if (session?.user) {
          const redirectTo = readPostLoginRedirectParam(searchParams);
          window.location.replace(redirectTo);
        }
      } catch {
        // Keep the form available on a transient network error.
      }
    })();

    if (envMissing) setError("Configuration error. Please contact support.");
  }, []); // eslint-disable-line

  const handleGoogleParentLogin = async () => {
    if (envMissing) return;
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
    } catch (err: unknown) {
      setError(friendlyActionError(err, 'Google sign-in failed. Please try again.'));
      setGoogleLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (envMissing) return;

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

      // Audit Log
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
      const msg = friendlyActionError(err, 'Sign in failed. Please check your credentials.');
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

  if (clearingSession) {
    return (
      <div className="h-screen w-screen bg-background text-foreground flex items-center justify-center p-4">
        <div
          className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center shadow-2xl space-y-3"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="mx-auto h-8 w-8 rounded-full border-2 border-brand-red-600/30 border-t-brand-red-600 animate-spin" />
          <h2 className="text-sm font-bold text-foreground">Signing you out securely…</h2>
          <p className="text-xs text-muted-foreground">Terminating active sessions and clearing credentials.</p>
        </div>
      </div>
    );
  }

  /*
    This page is meant to fit one screen — no scrolling to reach the sign-in
    button. It gets there by shrinking, not by being cut off.

    It used to do the opposite. `h-screen max-h-screen … overflow-hidden` pinned
    the page to exactly one viewport and clipped whatever did not fit, with no
    scroll to recover it: an iPhone SE in Safari (375×553 of usable height) lost
    22px — the footer — and a 320×480 handset lost 112px, taking the footer and
    the bottom of the card with it.

    So the fit is now handled where the problem is. The `max-height:620px`
    variants further down compact the page when the screen is genuinely short —
    the subtitle goes, paddings tighten — which is what keeps everything above
    the fold on a small phone, while tall phones stay roomy.

    `min-h-dvh` sizes to the *dynamic* viewport, tracking the browser's
    collapsing chrome instead of overshooting the way `100vh` does on iOS. The
    `min-` matters: it is the safety valve. If a state we did not budget for
    turns up — an error banner, a signed-out notice, a user with large system
    text — the page scrolls instead of hiding the button. Nothing is ever
    unreachable, and in the ordinary case there is nothing to scroll.

    PUBLIC_PAGE_ROOT and PUBLIC_SAFE_INSET are the conventions the other public
    pages already use; the latter was written for "full-screen auth layouts" and
    until now was used by nothing.
  */
  return (
    <div
      className={`${PUBLIC_PAGE_ROOT} ${PUBLIC_SAFE_INSET} w-full flex flex-col justify-between relative font-sans transition-colors duration-300 box-border sm:px-[max(1.25rem,var(--safe-area-left))] sm:pr-[max(1.25rem,var(--safe-area-right))] sm:pt-[max(1.25rem,var(--safe-area-top))] sm:pb-[max(1.25rem,var(--safe-area-bottom))] [@media(max-height:500px)]:pt-[max(0.5rem,var(--safe-area-top))] [@media(max-height:500px)]:pb-[max(0.5rem,var(--safe-area-bottom))]`}
    >
      {/* ── Subtle Ambient Backdrop Orbs ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10" aria-hidden>
        <div className="absolute top-1/4 -left-20 w-[500px] h-[500px] rounded-full bg-brand-blue/10 dark:bg-brand-blue/5 blur-3xl" />
        <div className="absolute bottom-1/4 -right-20 w-[450px] h-[450px] rounded-full bg-brand-red-600/10 dark:bg-brand-red-600/5 blur-3xl" />
      </div>

      {/* ── Top Header Navigation Bar ── */}
      <header className="w-full max-w-5xl mx-auto flex items-center justify-between py-1 shrink-0">
        <Link
          href={isNativeApp ? '/login' : '/'}
          aria-label={isNativeApp ? 'Rillcod portal login' : 'Rillcod home'}
          className="flex min-h-11 items-center gap-2.5 group transition-transform active:scale-95"
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white shadow-sm border border-black/10 p-1 flex items-center justify-center group-hover:shadow-md transition-all">
            <Image src="/images/logo.png" alt="Rillcod Technologies" width={40} height={40} className="object-contain w-full h-full" priority />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-base sm:text-lg font-black tracking-tight text-foreground leading-none">
              RILLCOD<span className="text-brand-red-600">.</span>
            </span>
            <span className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-muted-foreground mt-0.5">Technologies</span>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          {/*
            A way out, said in words.

            The logo has always linked home, but nothing announced it — somebody
            who opened the login by mistake had no visible way back to the site.
            Hidden inside the native app, where there is no website to return to.
          */}
          {!isNativeApp && (
            <Link
              href="/"
              className="inline-flex min-h-11 items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ArrowRight className="w-3.5 h-3.5 rotate-180" />
              {/* "Home" on a phone, where the header also carries the logo and
                  the Secure chip; the fuller wording once there is room. */}
              <span className="sm:hidden">Home</span>
              <span className="hidden sm:inline">Back to site</span>
            </Link>
          )}
          <Link
            href="/result-check"
            className="hidden min-h-11 sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 hover:bg-amber-500/15 transition-colors"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Check Access Card Result</span>
          </Link>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Secure</span>
          </div>
        </div>
      </header>

      {/* ── Main Centered Container (Fit inside single viewport) ── */}
      <main className="w-full max-w-5xl mx-auto my-auto py-1 flex items-center justify-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8 items-center">
          
          {/* ── Left Hero Side (Desktop) ── */}
          <div className="hidden lg:flex lg:col-span-5 flex-col justify-center space-y-4 pr-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-brand-blue/10 dark:bg-brand-blue/20 border border-brand-blue/20 rounded-full text-brand-blue dark:text-blue-400 w-fit">
              <Shield className="w-3 h-3" />
              <span className="text-[9px] font-black uppercase tracking-widest">Single Sign-On Workspace</span>
            </div>

            <h2 className="text-2xl xl:text-3xl font-black leading-tight tracking-tight text-foreground">
              Sign in to your learning & management portal
            </h2>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Use your account once. Your workspace and permissions are selected automatically.
            </p>

            <div className="p-3 rounded-2xl border border-border/80 bg-card/60 backdrop-blur-sm space-y-1.5">
              <p className="text-[11px] font-black uppercase tracking-wider text-foreground">Student Result Verification</p>
              <p className="text-[11px] text-muted-foreground leading-normal">
                Looking to view a term progress report with your physical access card?
              </p>
              <Link
                href="/result-check"
                className="inline-flex min-h-11 items-center gap-1 text-xs font-black text-primary hover:underline"
              >
                Go to Card Result Checker →
              </Link>
            </div>
          </div>

          {/* ── Right Form Card (Compact & Fitted) ── */}
          <div className="lg:col-span-7 w-full max-w-md mx-auto lg:max-w-none">
            {/* One semantic page heading. It remains available to assistive
                technology on desktop while the visible desktop hero uses h2. */}
            <div className="mb-4 text-center lg:sr-only [@media(max-height:620px)]:mb-2 [@media(max-height:500px)]:mb-1">
              <h1 className="text-xl sm:text-2xl font-black leading-tight tracking-tight text-foreground [@media(max-height:620px)]:text-lg">
                Sign in to your portal
              </h1>
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed [@media(max-height:620px)]:hidden">
                Your account opens the correct workspace automatically.
              </p>
            </div>

            <div className="bg-card/95 backdrop-blur-xl border border-border rounded-3xl shadow-xl overflow-hidden">

              {/* Form Area */}
              <div className="p-4 sm:p-5 sm:px-6 [@media(max-height:620px)]:p-3 [@media(max-height:500px)]:p-2.5">
                {sessionNotice && (
                  <div role="status" className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{sessionNotice}</p>
                  </div>
                )}

                {error && (
                  <div role="alert" aria-live="polite" className="mb-3 bg-destructive/10 border border-destructive/20 rounded-xl p-2.5 flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                    <p className="text-xs font-medium text-destructive leading-snug">{error}</p>
                  </div>
                )}

                <form onSubmit={handleLogin} className="space-y-3 [@media(max-height:620px)]:space-y-2">
                  {/* Email */}
                  <div className="space-y-1">
                    <label htmlFor="login-email" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground pl-0.5">
                      Email address
                    </label>
                    <div className="relative group">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
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
                        className="min-h-11 w-full bg-background border border-border rounded-xl pl-10 pr-3 py-2.5 text-base sm:text-xs focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-foreground"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between pl-0.5">
                      <label htmlFor="login-password" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Password
                      </label>
                      <Link
                        href="/reset-password"
                        className="inline-flex min-h-11 items-center text-[11px] font-bold text-primary hover:underline transition-all"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <div className="relative group">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors pointer-events-none" />
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
                        className="min-h-11 w-full bg-background border border-border rounded-xl pl-10 pr-11 py-2.5 text-base sm:text-xs focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-foreground"
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Sign In CTA */}
                  <button
                    type="submit"
                    disabled={loading || googleLoading}
                    className="w-full min-h-11 py-2.5 bg-primary text-primary-foreground font-black text-xs uppercase tracking-wider rounded-xl hover:bg-primary/95 transition-all transform active:scale-[0.99] disabled:opacity-40 flex items-center justify-center gap-2 shadow-md shadow-primary/20 mt-1"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifying account…</span>
                      </>
                    ) : (
                      <>
                        <span>Sign In to Portal</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>

                  {/* Google OAuth is intentionally labelled parent-only; password
                      users do not need to guess a role the account already owns. */}
                  <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-border/80" />
                        <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">or</span>
                        <div className="h-px flex-1 bg-border/80" />
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleGoogleParentLogin()}
                        disabled={loading || googleLoading}
                        className="w-full min-h-11 py-2 bg-background border border-border text-foreground font-bold text-xs rounded-xl hover:bg-muted/40 transition-all disabled:opacity-40 flex items-center justify-center gap-2 shadow-sm"
                      >
                        {googleLoading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Connecting to Google…</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" aria-hidden>
                              <path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.2-1.9 2.9l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7 0-.7-.1-1.3-.2-1.9H12z" />
                              <path fill="#34A853" d="M12 22c2.6 0 4.8-.9 6.4-2.3l-3.1-2.4c-.9.6-2 .9-3.3.9-2.5 0-4.6-1.7-5.4-4l-3.2 2.5C5.1 19.8 8.3 22 12 22z" />
                              <path fill="#4A90E2" d="M6.6 14.2c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9L3.4 8C2.6 9.5 2.2 11.1 2.2 12.8c0 1.7.4 3.3 1.2 4.7l3.2-2.5z" />
                              <path fill="#FBBC05" d="M12 5.8c1.4 0 2.7.5 3.7 1.4l2.8-2.8C16.8 2.8 14.6 2 12 2 8.3 2 5.1 4.2 3.4 7.5l3.2 2.5c.8-2.3 2.9-4.2 5.4-4.2z" />
                            </svg>
                            <span>Parent sign-in with Google</span>
                          </>
                        )}
                      </button>
                    </div>
                </form>

                {/* Sub-links */}
                <div className="mt-3.5 pt-2.5 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
                  <Link href="/partnership" className="inline-flex min-h-11 items-center hover:text-primary transition-colors font-medium">
                    School Partnership
                  </Link>
                  {/*
                    The separators only make sense while the links sit next to
                    each other. From `sm` up "Check Results" moves to the header
                    chip and `justify-between` pushes the two survivors to
                    opposite edges, which left a dot stranded in open space.
                  */}
                  <span className="sm:hidden" aria-hidden>·</span>
                  <Link href="/result-check" className="min-h-11 items-center hover:text-primary transition-colors font-medium inline-flex sm:hidden">
                    Check Results
                  </Link>
                  <span className="sm:hidden" aria-hidden>·</span>
                  <Link href="/student-registration" className="inline-flex min-h-11 items-center hover:text-primary transition-colors font-medium">
                    New Student Enroll
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Compact Bottom Footer ── */}
      <footer className="w-full max-w-5xl mx-auto py-1 flex flex-row items-center justify-between text-muted-foreground/60 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest shrink-0">
        <span>© {new Date().getFullYear()} Rillcod Technologies</span>
        <div className="flex items-center gap-3">
          <Link href="/privacy-policy" className="inline-flex min-h-11 min-w-11 items-center justify-center hover:text-foreground transition-colors">Privacy</Link>
          <span>·</span>
          <Link href="/terms-of-service" className="inline-flex min-h-11 min-w-11 items-center justify-center hover:text-foreground transition-colors">Terms</Link>
        </div>
      </footer>
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
