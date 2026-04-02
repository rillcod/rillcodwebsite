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
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-3 sm:p-6 lg:p-8 relative overflow-hidden font-sans">
      {/* ── Background Effects ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute top-1/4 -left-20 w-[400px] h-[400px] rounded-full bg-orange-600/10 blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 -right-20 w-[300px] h-[300px] rounded-full bg-orange-500/5 blur-[100px] animate-pulse [animation-delay:2s]" />
      </div>

      <div className="w-full max-w-5xl mx-auto relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8 items-center">
          
          {/* ── Left Section: Brand & Intro ── */}
          <div className="lg:col-span-5 flex flex-col justify-center py-4 lg:py-6 text-center lg:text-left">
            <Link href="/" className="flex items-center gap-3 group w-fit mx-auto lg:mx-0 mb-6 lg:mb-10 transition-transform hover:scale-[0.98]">
              <div className="w-12 h-12 bg-white/5 backdrop-blur-xl rounded-xl flex items-center justify-center border border-white/10 shadow-xl border-orange-500/10 group-hover:border-orange-500/30 transition-all">
                <Image src="/images/logo.png" alt="Rillcod" width={32} height={32} className="object-contain" />
              </div>
              <div className="leading-tight">
                <span className="text-xl font-black uppercase tracking-tighter block italic text-white">
                  RILLCOD<span className="not-italic text-orange-500">.</span>
                </span>
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/40">Technologies</span>
              </div>
            </Link>

            <div className="space-y-4 lg:space-y-6">
              <div className="inline-flex items-center gap-2.5 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-full">
                <Sparkles className="w-3 h-3 text-orange-400" />
                <span className="text-[9px] font-black text-orange-400 uppercase tracking-widest">Learning Portal</span>
              </div>

              <h1 className="text-4xl sm:text-6xl font-black leading-[0.85] tracking-tighter uppercase italic">
                GATEWAY<br />
                <span className="text-orange-500">FUTURE.</span>
              </h1>

              <p className="text-sm text-white/30 font-medium leading-relaxed max-w-sm hidden sm:block mx-auto lg:mx-0">
                Secure access to the ecosystem. Your journey into advanced STEM education continues here.
              </p>
            </div>
          </div>

          {/* ── Right Section: Interface ── */}
          <div className="lg:col-span-7 w-full">
            <div className="bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl">
              <div className="grid grid-cols-1 md:grid-cols-2">
                
                {/* Role Picker Column */}
                <div className="p-5 lg:p-7 border-b md:border-b-0 md:border-r border-white/5 bg-white/[0.01]">
                  <div className="mb-6 flex items-center justify-between md:block">
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-0.5">Authorization</h3>
                      <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Protocol Type</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-1 gap-2">
                    {ROLES.map((role) => {
                      const Icon = role.icon;
                      const isActive = selectedRole === role.id;
                      return (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => { setSelectedRole(role.id as Role); setError(null); }}
                          className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-300 group ${
                            isActive
                              ? 'bg-orange-600 border-orange-500 text-white shadow-lg'
                              : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10'
                          }`}
                        >
                          <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-white/40'}`} />
                          <span className="text-[9px] font-black uppercase tracking-[0.15em] truncate">{role.title}</span>
                          {isActive && <div className="ml-auto w-1 h-1 rounded-full bg-white animate-pulse" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Login Form Column */}
                <div className="p-5 lg:p-7 flex flex-col justify-center">
                  {error && (
                    <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2.5">
                      <AlertCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-[9px] font-bold text-red-400 leading-tight uppercase tracking-widest">{error}</p>
                    </div>
                  )}

                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] pl-1">ID KEY</label>
                      <div className="relative group">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/10 group-focus-within:text-orange-500 transition-colors" />
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="••••@DOMAIN"
                          className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:border-orange-500 transition-all font-mono placeholder:text-white/5"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] pl-1">PASSWORD</label>
                      <div className="relative group">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/10 group-focus-within:text-orange-500 transition-colors" />
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-11 py-3 text-sm focus:outline-none focus:border-orange-500 transition-all font-mono placeholder:text-white/5"
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/10 hover:text-white">
                          {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !selectedRole}
                      className="w-full py-3.5 bg-white text-black font-black text-[10px] uppercase tracking-[0.2em] rounded-xl hover:bg-orange-500 hover:text-white transition-all transform active:scale-95 disabled:opacity-20 flex items-center justify-center gap-2"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>AUTH ACCESS <ArrowRight className="w-3 h-3" /></>}
                    </button>
                  </form>

                  <div className="mt-6 pt-5 border-t border-white/5 flex items-center justify-between">
                    <Link href="/" className="text-[9px] font-black text-white/20 hover:text-orange-500 uppercase tracking-widest transition-all flex items-center gap-2">
                       Back to Home Page
                    </Link>
                    <div className="flex items-center gap-1 opacity-40">
                      <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-[8px] font-black uppercase tracking-widest">Secure</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-white/10 text-[8px] font-black uppercase tracking-[0.4em]">
           <span>© RILLCOD SYSTEM</span>
           <div className="flex gap-6">
              <span>NIGERIA</span>
              <span>V4.0</span>
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
