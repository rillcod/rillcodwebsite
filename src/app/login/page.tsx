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

const ROLES = [
  { id: "student", icon: GraduationCap, title: "Student",  color: "text-cyan-500"   },
  { id: "teacher", icon: User,           title: "Teacher",  color: "text-violet-500" },
  { id: "parent",  icon: Heart,          title: "Parent",   color: "text-pink-500"   },
  { id: "school",  icon: Building2,      title: "School",   color: "text-emerald-500"},
  { id: "admin",   icon: Shield,         title: "Admin",    color: "text-orange-500" },
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

    if (searchParams?.get("clear") === "1") {
      supabase.auth.signOut().then(() => {
        window.location.replace('/login');
      });
      setEmail(""); setPassword(""); setSelectedRole(null); setError(null);
      return;
    }
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
        .select('role, is_active')
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

      const redirectTo = searchParams?.get('redirectedFrom') || '/dashboard';
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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-8 relative overflow-hidden">
      {/* Ambient glows — subtle in both themes */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-orange-500/5 blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] rounded-full bg-indigo-500/5 blur-[100px]" />
      </div>

      <div className="w-full max-w-5xl mx-auto relative z-10">
        {/* ── Card shell ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 bg-card border border-border shadow-2xl shadow-black/10 overflow-hidden rounded-2xl">

          {/* ── LEFT PANEL: Brand + Role picker ── */}
          <div className="relative flex flex-col p-8 sm:p-10 lg:p-12 bg-gradient-to-br from-orange-600 via-orange-500 to-amber-500">
            {/* Noise texture overlay */}
            <div className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`
              }}
            />

            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 mb-10 group w-fit">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/30 shadow-lg group-hover:scale-105 transition-transform">
                <Image src="/images/logo.png" alt="Rillcod" width={32} height={32} className="object-contain filter brightness-0 invert" />
              </div>
              <div className="leading-none">
                <span className="text-xl font-black uppercase tracking-tight block text-white italic">
                  RILLCOD<span className="not-italic text-white/60">.</span>
                </span>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Technologies</span>
              </div>
            </Link>

            {/* Headline */}
            <div className="flex-1 flex flex-col justify-center">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full w-fit mb-6">
                <Sparkles className="w-3 h-3 text-white" />
                <span className="text-[9px] font-black text-white/80 uppercase tracking-widest">Learning Portal</span>
              </div>

              <h1 className="text-4xl sm:text-5xl font-black text-white leading-[0.95] tracking-tight mb-4 uppercase">
                WELCOME<br />
                <span className="text-white/40 italic">BACK.</span>
              </h1>

              <p className="text-sm text-white/60 font-medium leading-relaxed max-w-xs hidden sm:block">
                Access your personalised dashboard — manage curriculum, track progress, and complete STEM assignments.
              </p>
            </div>

            {/* ── Role selector (Desktop inside left panel) ── */}
            <div className="mt-8 hidden lg:block">
              <p className="text-[10px] font-black text-white uppercase tracking-[0.2em] mb-4">I am signing in as a...</p>
              <div className="grid grid-cols-1 gap-2.5">
                {ROLES.map((role) => {
                  const Icon = role.icon;
                  const isActive = selectedRole === role.id;
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => { setSelectedRole(role.id as Role); setError(null); }}
                      className={`flex items-center gap-4 px-5 py-4 rounded-2xl border-2 transition-all duration-300 text-left group ${
                        isActive
                          ? 'bg-white text-orange-600 border-white shadow-[0_10px_30px_-10px_rgba(0,0,0,0.3)] scale-[1.02]'
                          : 'bg-white/10 border-white/20 text-white hover:bg-white/20 hover:border-white/40'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isActive ? 'bg-orange-500/10' : 'bg-white/10 group-hover:bg-white/20'}`}>
                        <Icon className={`w-5 h-5 ${isActive ? 'text-orange-600' : 'text-white'}`} />
                      </div>
                      <div className="flex-1">
                        <span className="text-xs font-black uppercase tracking-widest block leading-none mb-1">
                          {role.title}
                        </span>
                        <span className={`text-[9px] font-medium uppercase tracking-wider opacity-60 ${isActive ? 'text-orange-600' : 'text-white'}`}>
                          {role.id === 'student' && 'Access curriculum & labs'}
                          {role.id === 'teacher' && 'Manage classes & grading'}
                          {role.id === 'parent' && 'Track student performance'}
                          {role.id === 'school' && 'Administrative controls'}
                          {role.id === 'admin' && 'System configuration'}
                        </span>
                      </div>
                      {isActive && <div className="w-2 h-2 rounded-full bg-orange-600 animate-pulse" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── RIGHT PANEL: Form ── */}
          <div className="flex flex-col p-8 sm:p-10 lg:p-12">

            {/* ── Role selector (Mobile — above form) ── */}
            <div className="lg:hidden mb-10">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-4">I am a...</p>
              <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
                {ROLES.map((role) => {
                  const Icon = role.icon;
                  const isActive = selectedRole === role.id;
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => { setSelectedRole(role.id as Role); setError(null); }}
                      className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all duration-200 text-left ${
                        isActive
                          ? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/20'
                          : 'bg-card border-border text-muted-foreground hover:border-orange-500/30'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-orange-500/60'}`} />
                      <span className="text-[10px] font-black uppercase tracking-widest">
                        {role.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Form header */}
            <div className="mb-8">
              <h2 className="text-2xl font-black text-foreground uppercase tracking-tight mb-1">Sign In</h2>
              <p className="text-xs text-muted-foreground font-medium">
                {activeRole
                  ? `Signing in as ${activeRole.title}`
                  : 'Select your role, then sign in below'}
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-6 flex items-start gap-3 px-4 py-3 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive font-medium">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleLogin} className="flex flex-col gap-5 flex-1">
              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest pl-0.5">
                  Email Address
                </label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-orange-500 transition-colors pointer-events-none" />
                  <input
                    id="login-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your.email@example.com"
                    className="w-full bg-background border border-border rounded-xl pl-11 pr-4 py-3.5 text-foreground font-medium text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-all placeholder:text-muted-foreground/50"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest pl-0.5">
                  Password
                </label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-orange-500 transition-colors pointer-events-none" />
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-background border border-border rounded-xl pl-11 pr-12 py-3.5 text-foreground font-medium text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-all placeholder:text-muted-foreground/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                id="login-submit"
                disabled={loading || !selectedRole}
                className="group mt-2 flex items-center justify-center gap-3 w-full py-4 bg-orange-500 hover:bg-orange-600 active:scale-[0.98] text-white font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>

              {/* Footer links */}
              <div className="pt-4 border-t border-border flex items-center justify-between mt-auto">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 text-[10px] font-black text-muted-foreground hover:text-foreground uppercase tracking-widest transition-colors"
                >
                  <ArrowLeft className="w-3 h-3" /> Back to Home
                </Link>
                <Link
                  href="/reset-password"
                  className="text-[10px] font-black text-orange-500 hover:text-orange-400 uppercase tracking-widest transition-colors"
                >
                  Forgot Password?
                </Link>
              </div>
            </form>
          </div>

        </div>

        {/* Bottom tagline */}
        <p className="text-center text-[10px] text-muted-foreground font-medium mt-6 uppercase tracking-widest">
          Rillcod Technologies · Benin City, Nigeria · academy.rillcod.com
        </p>
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
