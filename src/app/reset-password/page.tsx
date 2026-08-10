"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import Link from "next/link";
import { Lock, Mail, Eye, EyeOff, GraduationCap, ArrowLeft, ArrowRight, Loader2, CheckCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { withTimeoutOrThrow } from "@/lib/async-timeout";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"email" | "reset">("email");
  const [done, setDone] = useState(false);

  // Supabase sends ?step=reset after email click
  useEffect(() => {
    if (searchParams?.get("step") === "reset") setStep("reset");
  }, [searchParams]);

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await withTimeoutOrThrow(
        createClient().auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password?step=reset`,
        }),
        'Sending the reset link is taking longer than expected. Please try again.',
      );
      if (error) {
        console.error('Password reset email request failed', error);
        throw new Error('We could not send the reset link just now. Please try again.');
      }
      toast.success("Reset link sent — check your inbox!");
      setDone(true);
    } catch (err: unknown) {
      console.error('Password reset email action failed', err);
      toast.error(err instanceof Error ? err.message : "We could not send the reset link. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { toast.error("Passwords do not match"); return; }
    if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      const { error } = await withTimeoutOrThrow(
        createClient().auth.updateUser({ password }),
        'Updating the password is taking longer than expected. Please try again.',
      );
      if (error) {
        console.error('Password update failed', error);
        const expired = /session|expired|token/i.test(error.message);
        throw new Error(expired
          ? 'This reset link is no longer valid. Request a new reset link and try again.'
          : 'We could not update the password just now. Please try again.');
      }
      toast.success("Password updated! Redirecting to login…");
      setTimeout(() => router.push('/login'), 2000);
    } catch (err: unknown) {
      console.error('Password update action failed', err);
      toast.error(err instanceof Error ? err.message : "We could not update the password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4 py-12 relative overflow-hidden public-page-root overflow-x-clip">
      {/* Background orbs */}
      <div className="absolute top-[-15%] right-[-10%] w-[45%] h-[45%] bg-primary/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-15%] left-[-10%] w-[40%] h-[40%] bg-brand-red-600/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">

        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 group justify-center mb-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center dark:bg-white dark:shadow-md dark:border dark:border-white/20 group-hover:shadow-xl transition-all">
              <img src="/images/logo.png" alt="Rillcod" className="object-contain w-[85%] h-[85%]" />
            </div>
            <div className="text-left leading-tight">
              <span className="text-2xl font-bold tracking-tight block text-foreground">
                RILLCOD<span className="not-italic text-brand-red-600">.</span>
              </span>
              <span className="text-xs font-medium text-muted-foreground block mt-0.5 uppercase tracking-widest">Technologies</span>
            </div>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground mt-4">
            {step === "email" ? "Reset password" : "Set new password"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1.5">
            {step === "email"
              ? "Enter your email to receive a secure reset link"
              : "Choose a strong new password for your account"}
          </p>
        </div>

        <div className="mb-6 flex justify-start">
          <Link href="/login" className="inline-flex items-center gap-2 px-4 py-2 bg-card hover:bg-muted border border-border rounded-xl text-foreground text-xs font-bold transition-all">
            <ArrowLeft className="w-3.5 h-3.5 text-primary" />
            <span>Back to Login</span>
          </Link>
        </div>

        {/* Card */}
        <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-6 sm:p-8 shadow-xl">

          {/* ── STEP: EMAIL ── */}
          {step === "email" && !done && (
            <form onSubmit={handleSendLink} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-xl text-foreground text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand-red-600 focus:ring-2 focus:ring-brand-red-600/20 transition-all" />
                </div>
              </div>

              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary hover:bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 transition-all disabled:opacity-50 min-h-11">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          )}

          {/* ── STEP: EMAIL SENT ── */}
          {step === "email" && done && (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="font-bold text-foreground">Check your inbox!</p>
              <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
                We sent a password reset link to <strong className="text-foreground">{email}</strong>.
                Click the link to set a new password.
              </p>
              <button onClick={() => { setDone(false); setEmail(''); }}
                className="mt-5 text-sm text-primary hover:text-primary/80 transition-colors font-semibold">
                Try a different email
              </button>
            </div>
          )}

          {/* ── STEP: NEW PASSWORD ── */}
          {step === "reset" && (
            <form onSubmit={handleReset} className="space-y-4">
              {[
                { label: 'New Password', val: password, set: setPassword },
                { label: 'Confirm Password', val: confirm, set: setConfirm },
              ].map((f, idx) => (
                <div key={f.label}>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">{f.label}</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type={showPw ? "text" : "password"} required
                      value={f.val} onChange={e => f.set(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-10 py-3 bg-background border border-border rounded-xl text-foreground text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:border-brand-red-600 focus:ring-2 focus:ring-brand-red-600/20 transition-all" />
                    {idx === 0 && (
                      <button type="button" onClick={() => setShowPw(v => !v)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {confirm && password && (
                <div className={`flex items-center gap-2 text-sm font-semibold ${password === confirm ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {password === confirm
                    ? <><CheckCircle className="w-4 h-4" /> Passwords match</>
                    : <>✗ Passwords do not match</>}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary hover:bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 transition-all disabled:opacity-50 min-h-11">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {loading ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          )}

          {/* Footer */}
          <div className="flex items-center justify-center mt-5">
            <Link href="/login" className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
