"use client";

import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/logger';
import { Mail, Lock, Eye, EyeOff, User, GraduationCap, Shield, Building2, Heart, ArrowRight, Loader2, ArrowLeft, Sparkles } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from 'next/link';
import Image from 'next/image';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const envMissing = useMemo(
    () => !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    []
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<"student" | "teacher" | "admin" | "school" | "parent" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const type = searchParams?.get("type");
    if (type === "admin" || type === "teacher" || type === "student" || type === "school" || type === "parent") setSelectedRole(type);

    if (searchParams?.get("clear") === "1") {
      supabase.auth.signOut().then(() => {
        window.location.replace('/login');
      });
      setEmail("");
      setPassword("");
      setSelectedRole(null);
      setError(null);
      return;
    }

    if (envMissing) {
      setError("Configuration error. Please contact support.");
    }
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
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
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
      // Full page reload — clears all React state and router cache from the
      // previous session so a switched account always loads completely fresh
      window.location.href = redirectTo;

    } catch (err: any) {
      clearTimeout(timeout);
      const msg = err?.message || '';
      // Translate Supabase auth errors to friendly messages
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

  return (
    <div className="min-h-screen bg-[#0D0E1B] flex flex-col items-center justify-center p-6 lg:p-12 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 right-0 w-[40%] h-[40%] bg-blue-600/5 blur-[120px]" />
      <div className="absolute bottom-0 left-0 w-[30%] h-[30%] bg-orange-500/5 blur-[100px]" />

      <div className="w-full max-w-screen-xl mx-auto flex flex-col lg:flex-row gap-16 lg:gap-24 items-center relative z-10">

        {/* Left Side: Brand & Role selection */}
        <div className="w-full lg:w-1/2 flex flex-col text-center lg:text-left">
          <div className="flex flex-col items-center lg:items-start mb-12">
            <Link href="/" className="inline-flex items-center gap-4 mb-10 group">
              <div className="w-20 h-20 bg-white/5 border border-white/10 flex items-center justify-center group-hover:scale-105 transition-transform ring-1 ring-white/20 ring-offset-2 ring-offset-[#0D0E1B]">
                <Image src="/images/logo.png" alt="Rillcod" width={56} height={56} className="object-contain" />
              </div>
              <div className="text-left leading-none">
                <span className="text-2xl font-black uppercase tracking-tight block leading-tight italic text-white">RILLCOD<span className="text-orange-500 not-italic">.</span></span>
                <span className="text-2xl font-black uppercase tracking-tight block leading-tight italic text-orange-500">TECHNOLOGIES</span>
              </div>
            </Link>

            <div className="inline-flex items-center gap-3 px-4 py-2 bg-orange-500/10 border border-orange-500/20 mb-8">
              <Sparkles className="w-4 h-4 text-orange-500" />
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Learning Portal</span>
            </div>

            <h2 className="text-4xl sm:text-6xl font-black text-white leading-[1] tracking-tight mb-8 uppercase">
              WELCOME <br />
              <span className="text-white/40 italic">BACK.</span>
            </h2>

            <p className="text-lg text-slate-400 font-medium italic border-l-2 border-orange-500 pl-6 max-w-md hidden lg:block">
              Access your personalised dashboard to manage curriculum, track progress, and complete STEM assignments.
            </p>
          </div>

          {/* Role Selection */}
          <div className="space-y-3 mb-4 lg:hidden">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">I am a...</p>
          </div>
          <div className="hidden lg:block mb-3">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">I am a...</p>
          </div>
          <div className="grid grid-cols-2 gap-4 max-w-md mx-auto lg:mx-0">
            {[
              { id: "student", icon: GraduationCap, title: "Student" },
              { id: "teacher", icon: User,          title: "Teacher" },
              { id: "parent",  icon: Heart,         title: "Parent"  },
              { id: "school",  icon: Building2,     title: "School"  },
              { id: "admin",   icon: Shield,        title: "Admin"   },
            ].map((role) => (
              <button
                key={role.id}
                onClick={() => { setSelectedRole(role.id as any); setError(null); }}
                className={`group p-6 bg-white/[0.02] border transition-all flex flex-col items-center gap-3 ${
                  selectedRole === role.id
                    ? 'border-orange-500 bg-white/[0.05] shadow-2xl scale-[1.02]'
                    : 'border-white/5 hover:border-white/20'
                }`}
              >
                <role.icon className={`w-6 h-6 transition-colors group-hover:scale-110 transition-transform ${
                  selectedRole === role.id ? 'text-orange-500' : 'text-slate-600'
                }`} />
                <span className={`text-[10px] font-black uppercase tracking-widest ${
                  selectedRole === role.id ? 'text-white' : 'text-slate-500'
                }`}>
                  {role.title}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Right Side: Form */}
        <div className="w-full lg:w-1/2 flex justify-center">
          <div className="w-full max-w-md bg-[#141424] border border-white/10 border-t-4 border-t-orange-500 p-8 md:p-12 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.02] blur-[100px] pointer-events-none" />

            <div className="mb-8">
              <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-1">Sign In</h3>
              <p className="text-xs text-slate-500 font-medium">
                {selectedRole
                  ? `Signing in as ${selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)}`
                  : 'Select your role on the left, then sign in'}
              </p>
            </div>

            {error && (
              <div className="mb-6 px-4 py-3 bg-red-500/10 border border-red-500/20 text-sm text-red-400 font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-6 relative z-10">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Email Address</label>
                <div className="relative group">
                  <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-orange-500 transition-colors" />
                  <input
                    type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="your.email@example.com"
                    className="w-full bg-[#0D0E1B] border border-white/10 pl-12 pr-5 py-4 text-white font-medium text-sm focus:outline-none focus:border-orange-500 transition-all placeholder:text-slate-700"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Password</label>
                <div className="relative group">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-orange-500 transition-colors" />
                  <input
                    type={showPassword ? "text" : "password"} required value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#0D0E1B] border border-white/10 pl-12 pr-12 py-4 text-white font-medium text-sm focus:outline-none focus:border-orange-500 transition-all placeholder:text-slate-700"
                  />
                  <button
                    type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit" disabled={loading || !selectedRole}
                className="group flex items-center justify-center gap-3 w-full py-5 bg-orange-500 hover:bg-orange-600 text-white font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50 hover:scale-[1.01] active:scale-95"
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

              <div className="pt-6 border-t border-white/5 text-center">
                <Link href="/" className="inline-flex items-center gap-2 text-[10px] font-black text-slate-600 hover:text-white uppercase tracking-widest transition-colors">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Home
                </Link>
              </div>
            </form>
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
