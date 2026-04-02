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
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-4 sm:p-8 relative overflow-hidden font-sans">
      {/* ── Background Effects ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {/* Animated Orbs */}
        <div className="absolute top-1/4 -left-20 w-[600px] h-[600px] rounded-full bg-orange-600/10 blur-[140px] animate-pulse" />
        <div className="absolute bottom-1/4 -right-20 w-[500px] h-[500px] rounded-full bg-orange-500/5 blur-[120px] animate-pulse [animation-delay:2s]" />
        
        {/* Technical Grid background */}
        <div className="absolute inset-0 opacity-[0.03]" 
          style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} 
        />
      </div>

      <div className="w-full max-w-6xl mx-auto relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          
          {/* ── Left Section: Brand & Intro ── */}
          <div className="lg:col-span-5 flex flex-col justify-between py-8 lg:py-12">
            <Link href="/" className="flex items-center gap-4 group w-fit mb-12">
              <div className="w-14 h-14 bg-white/5 backdrop-blur-xl rounded-2xl flex items-center justify-center border border-white/10 shadow-2xl group-hover:border-orange-500/50 transition-all duration-500">
                <Image src="/images/logo.png" alt="Rillcod" width={38} height={38} className="object-contain" />
              </div>
              <div className="leading-tight">
                <span className="text-2xl font-black uppercase tracking-tighter block italic text-white">
                  RILLCOD<span className="not-italic text-orange-500">.</span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">Technologies</span>
              </div>
            </Link>

            <div className="space-y-6">
              <div className="inline-flex items-center gap-3 px-4 py-2 bg-orange-500/10 border border-orange-500/20 rounded-full">
                <Sparkles className="w-4 h-4 text-orange-400" />
                <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest whitespace-nowrap">Propelling Innovation</span>
              </div>

              <h1 className="text-5xl sm:text-7xl font-black leading-[0.85] tracking-tighter uppercase italic">
                GATEWAY<br />
                <span className="text-transparent border-t-2 border-white/5 pt-2" style={{ WebkitTextStroke: '1px rgba(255,255,255,0.2)' }}>TO THE</span><br />
                <span className="text-orange-500">FUTURE.</span>
              </h1>

              <p className="text-base text-white/40 font-medium leading-relaxed max-w-md">
                Secure access to the Rillcod Learning Ecosystem. Your journey into advanced STEM education and professional mastery continues here.
              </p>
            </div>

            <div className="mt-12 lg:mt-0 flex items-center gap-6">
               <div className="flex -space-x-3">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="w-10 h-10 rounded-full border-2 border-[#050505] bg-neutral-800 flex items-center justify-center overflow-hidden">
                      <div className="w-full h-full bg-gradient-to-br from-orange-500/20 to-neutral-900" />
                    </div>
                  ))}
               </div>
               <p className="text-xs font-bold text-white/60 uppercase tracking-widest">
                  Join 2,000+ Students
               </p>
            </div>
          </div>

          {/* ── Right Section: Interface ── */}
          <div className="lg:col-span-7">
            <div className="bg-white/[0.03] backdrop-blur-3xl border border-white/10 rounded-[2.5rem] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.5)]">
              <div className="grid grid-cols-1 md:grid-cols-2">
                
                {/* Role Picker Column */}
                <div className="p-8 lg:p-10 border-b md:border-b-0 md:border-r border-white/5">
                  <div className="mb-8">
                    <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white/40 mb-1">Authorization</h3>
                    <p className="text-[11px] font-bold text-white/20 uppercase tracking-widest">Select your protocol</p>
                  </div>
                  
                  <div className="space-y-2">
                    {ROLES.map((role) => {
                      const Icon = role.icon;
                      const isActive = selectedRole === role.id;
                      return (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => { setSelectedRole(role.id as Role); setError(null); }}
                          className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all duration-500 group ${
                            isActive
                              ? 'bg-orange-600 border-orange-500 text-white shadow-lg shadow-orange-600/20'
                              : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/10 hover:border-white/10'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all ${isActive ? 'bg-white/20' : 'bg-white/5 group-hover:bg-white/10'}`}>
                            <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-white/40'}`} />
                          </div>
                          <span className="text-[11px] font-black uppercase tracking-[0.2em]">{role.title}</span>
                          {isActive && <ArrowRight className="w-4 h-4 ml-auto" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Login Form Column */}
                <div className="p-8 lg:p-10 flex flex-col">
                  {error && (
                    <div className="mb-6 bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-4">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] font-bold text-red-400 leading-relaxed uppercase tracking-widest">{error}</p>
                    </div>
                  )}

                  <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] pl-1">Identification</label>
                      <div className="relative group">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-orange-500 transition-colors" />
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="ACCESS_KEY@DOMAIN.CORP"
                          className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/50 transition-all placeholder:text-white/10 font-mono tracking-wider"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] pl-1">Security Code</label>
                      <div className="relative group">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-orange-500 transition-colors" />
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••••••"
                          className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-12 py-4 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/50 transition-all placeholder:text-white/10 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-colors"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !selectedRole}
                      className="w-full py-5 bg-white text-black font-black text-xs uppercase tracking-[0.3em] rounded-2xl hover:bg-orange-500 hover:text-white transition-all duration-500 disabled:opacity-20 disabled:cursor-not-allowed transform active:scale-95 shadow-2xl flex items-center justify-center gap-3"
                    >
                      {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>Access Portal <ArrowRight className="w-4 h-4" /></>
                      )}
                    </button>
                  </form>

                  <div className="mt-auto pt-8 flex items-center justify-between border-t border-white/5">
                    <Link href="/" className="text-[10px] font-black text-white/20 hover:text-orange-500 uppercase tracking-widest transition-all flex items-center gap-2">
                      <ArrowLeft className="w-3 h-3" /> System Root
                    </Link>
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-[10px] font-black text-white/20 uppercase tracking-widest leading-none">Security Active</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col md:flex-row items-center justify-between gap-4 text-white/20 text-[9px] font-black uppercase tracking-[0.4em]">
           <span>© 2026 RILLCOD ACADEMY SYSTEM</span>
           <div className="flex gap-8">
              <span>Benin City, Nigeria</span>
              <span>v.4.0.2</span>
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
