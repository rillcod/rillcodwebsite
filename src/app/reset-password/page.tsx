"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import Link from "next/link";
import { Lock, Mail, Eye, EyeOff, GraduationCap, ArrowLeft, ArrowRight, Loader2, CheckCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

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
      const { error } = await createClient().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password?step=reset`,
      });
      if (error) throw error;
      toast.success("Reset link sent — check your inbox!");
      setDone(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to send reset link");
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
      const { error } = await createClient().auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated! Redirecting to login…");
      setTimeout(() => router.push('/login'), 2000);
    } catch (err: any) {
      toast.error(err.message || "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Background orbs */}
      <div className="absolute top-[-15%] right-[-10%] w-[45%] h-[45%] bg-violet-700/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-15%] left-[-10%] w-[40%] h-[40%] bg-blue-700/15 rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">

        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-black text-white">Rillcod <span className="text-violet-400">Academy</span></span>
          </Link>
          <h1 className="text-3xl font-extrabold text-white mt-6">
            {step === "email" ? "Reset password" : "Set new password"}
          </h1>
          <p className="text-white/40 text-sm mt-1.5">
            {step === "email"
              ? "Enter your email to receive a secure reset link"
              : "Choose a strong new password for your account"}
          </p>
        </div>

        <div className="absolute top-4 left-4 z-50">
          <Link href="/" className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/70 hover:text-white transition-all backdrop-blur-md">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back to Home</span>
          </Link>
        </div>

        {/* Card */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-7 shadow-2xl backdrop-blur-md">

          {/* ── STEP: EMAIL ── */}
          {step === "email" && !done && (
            <form onSubmit={handleSendLink} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                  <input
                    type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-white/25 focus:outline-none focus:border-violet-500 transition-all" />
                </div>
              </div>

              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg shadow-violet-500/20 transition-all disabled:opacity-50">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          )}

          {/* ── STEP: EMAIL SENT ── */}
          {step === "email" && done && (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <p className="font-bold text-white">Check your inbox!</p>
              <p className="text-white/40 text-sm mt-2 leading-relaxed">
                We sent a password reset link to <strong className="text-white/60">{email}</strong>.
                Click the link to set a new password.
              </p>
              <button onClick={() => { setDone(false); setEmail(''); }}
                className="mt-5 text-sm text-violet-400 hover:text-violet-300 transition-colors font-semibold">
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
                  <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">{f.label}</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                    <input
                      type={showPw ? "text" : "password"} required
                      value={f.val} onChange={e => f.set(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-10 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-white/25 focus:outline-none focus:border-violet-500 transition-all" />
                    {idx === 0 && (
                      <button type="button" onClick={() => setShowPw(v => !v)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {confirm && password && (
                <div className={`flex items-center gap-2 text-sm font-semibold ${password === confirm ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {password === confirm
                    ? <><CheckCircle className="w-4 h-4" /> Passwords match</>
                    : <>✗ Passwords do not match</>}
                </div>
              )}

              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg shadow-violet-500/20 transition-all disabled:opacity-50">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {loading ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          )}

          {/* Footer */}
          <div className="flex items-center justify-center mt-5">
            <Link href="/login" className="flex items-center gap-1.5 text-sm text-white/30 hover:text-white/60 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}