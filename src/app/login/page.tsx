"use client";

import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/logger';
import { Mail, Lock, Eye, EyeOff, User, GraduationCap, Shield, Building2, ArrowRight, Loader2, ArrowLeft, Command, Sparkles } from "lucide-react";
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
  const [selectedRole, setSelectedRole] = useState<"student" | "teacher" | "admin" | "school" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const type = searchParams?.get("type");
    if (type === "admin" || type === "teacher" || type === "student" || type === "school") setSelectedRole(type);
    if (searchParams?.get("clear") === "1") {
      supabase.auth.signOut().then(() => router.replace('/login'));
    }
    if (envMissing) {
      setError("Missing configuration signal.");
    }
    return () => abortRef.current?.abort();
  }, []); // eslint-disable-line

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (envMissing) return;
    if (!selectedRole) { setError("Role specification required."); return; }

    setLoading(true);
    setError(null);

    abortRef.current = new AbortController();
    const timeout = setTimeout(() => abortRef.current?.abort(), 12000);

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      clearTimeout(timeout);

      if (authError) throw authError;
      if (!authData?.user) throw new Error("Authentication link failure.");

      const { data: profileData, error: profileError } = await supabase
        .from('portal_users')
        .select('role, is_active')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profileData) throw new Error("Entity record not found.");
      if (!profileData.is_active) {
        await supabase.auth.signOut();
        throw new Error("Protocol inactive. Access denied.");
      }
      if (profileData.role !== selectedRole) {
        await supabase.auth.signOut();
        throw new Error(`Invalid role access: expected ${profileData.role}.`);
      }

      const redirectTo = searchParams?.get('redirectedFrom') || '/dashboard';
      router.push(redirectTo);
      router.refresh();

    } catch (err: any) {
      clearTimeout(timeout);
      setError(err?.message || 'Uplink failed. Check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center p-6 lg:p-12 relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-[40%] h-[40%] bg-blue-600/5 blur-[120px] rounded-none" />
      <div className="absolute bottom-0 left-0 w-[30%] h-[30%] bg-orange-500/5 blur-[100px] rounded-none" />

      <div className="w-full max-w-screen-xl mx-auto flex flex-col lg:flex-row gap-16 lg:gap-24 items-center relative z-10">

        {/* Left Side: Brand & Role */}
        <div className="w-full lg:w-1/2 flex flex-col text-center lg:text-left">
          <div className="flex flex-col items-center lg:items-start mb-12">
            <Link href="/" className="inline-flex items-center gap-4 mb-10 group">
              <div className="w-20 h-20 bg-orange-500 flex items-center justify-center rounded-none shadow-xl shadow-orange-500/20 group-hover:scale-105 transition-transform">
                <Image
                  src="/images/logo.png"
                  alt="Rillcod"
                  width={64}
                  height={64}
                  className="object-contain mix-blend-multiply"
                />
              </div>
              <div className="text-left">
                <span className="text-2xl font-black uppercase tracking-tight block leading-none italic text-white">RILLCOD<span className="text-orange-500 not-italic">.</span></span>
                <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em] leading-none mt-1.5 whitespace-nowrap">STEM Excellence</p>
              </div>
            </Link>

            <div className="inline-flex items-center gap-3 px-4 py-2 bg-orange-500/10 border border-orange-500/20 rounded-none mb-8">
              <Sparkles className="w-4 h-4 text-orange-500" />
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Protocol Authentication</span>
            </div>

            <h2 className="text-4xl sm:text-6xl font-black text-white leading-[1] tracking-tight mb-8 uppercase">
              ENTER THE <br />
              <span className="text-white/40 italic">CORE MATRIX.</span>
            </h2>

            <p className="text-lg text-slate-400 font-medium italic border-l-2 border-orange-500 pl-6 max-w-md hidden lg:block">
              Access your personalized dashboard to manage curriculum, track progress, and deploy STEM assignments.
            </p>
          </div>

          {/* Role Selection Grid */}
          <div className="grid grid-cols-2 gap-4 max-w-md mx-auto lg:mx-0">
            {[
              { id: "student", icon: GraduationCap, title: "Student", accent: "text-blue-500" },
              { id: "teacher", icon: User, title: "Teacher", accent: "text-teal-500" },
              { id: "school", icon: Building2, title: "School", accent: "text-orange-500" },
              { id: "admin", icon: Shield, title: "Admin", accent: "text-purple-500" }
            ].map((role) => (
              <button
                key={role.id}
                onClick={() => setSelectedRole(role.id as any)}
                className={`group p-6 bg-white/[0.02] border rounded-none transition-all flex flex-col items-center gap-3 ${selectedRole === role.id ? 'border-orange-500 bg-white/[0.05] shadow-2xl scale-[1.02]' : 'border-white/5 hover:border-white/20'}`}
              >
                <role.icon className={`w-6 h-6 ${selectedRole === role.id ? 'text-orange-500' : 'text-slate-600'} group-hover:scale-110 transition-transform`} />
                <span className={`text-[10px] font-black uppercase tracking-widest ${selectedRole === role.id ? 'text-white' : 'text-slate-500'}`}>{role.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right Side: Form */}
        <div className="w-full lg:w-1/2 flex justify-center">
          <div className="w-full max-w-md bg-[#1a1a1a] border border-white/10 p-8 md:p-12 shadow-2xl relative overflow-hidden rounded-none border-t-4 border-t-orange-500">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 blur-[100px] pointer-events-none" />

            <div className="mb-10 text-center lg:text-left">
              <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-2">Sign In</h3>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Identify Credentials</p>
            </div>

            {error && (
              <div className="mb-8 p-6 bg-red-500/10 border border-red-500/20 rounded-none flex items-start gap-4 italic text-sm text-red-400 font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-8 relative z-10">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Secure Email</label>
                <div className="relative group">
                  <Mail className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-orange-500 transition-colors" />
                  <input
                    type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="uplink@rillcod.com"
                    className="w-full bg-[#121212] border border-white/10 pl-14 pr-6 py-5 rounded-none text-white font-bold text-sm focus:outline-none focus:border-orange-500 transition-all placeholder:text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Access Key</label>
                  <Link href="/reset-password" className="text-[9px] font-black text-orange-500 uppercase tracking-widest hover:text-orange-400 transition-colors">Reset Key</Link>
                </div>
                <div className="relative group">
                  <Lock className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-orange-500 transition-colors" />
                  <input
                    type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#121212] border border-white/10 pl-14 pr-14 py-5 rounded-none text-white font-bold text-sm focus:outline-none focus:border-orange-500 transition-all placeholder:text-slate-800"
                  />
                  <button
                    type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit" disabled={loading || !selectedRole}
                className="group flex items-center justify-center gap-4 w-full px-12 py-6 bg-orange-500 text-white font-black text-xs uppercase tracking-[0.4em] rounded-none hover:bg-orange-600 transition-all shadow-xl shadow-orange-500/20 disabled:opacity-50 hover:scale-[1.02] active:scale-95"
              >
                {loading ? 'Processing...' : 'Secure Login'}
                {!loading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
              </button>

              <div className="pt-8 border-t border-white/5 text-center">
                <Link href="/" className="inline-flex items-center gap-3 text-[10px] font-black text-slate-600 hover:text-white uppercase tracking-widest transition-colors">
                  <ArrowLeft className="w-4 h-4" /> Return to Base
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
