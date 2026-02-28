"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from '@/lib/supabase/client';
import { Mail, Lock, Eye, EyeOff, User, GraduationCap, Shield, ArrowRight, Loader2, CheckCircle } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";



export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<"student" | "teacher" | "admin" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    const type = searchParams?.get("type");
    if (type === "admin" || type === "teacher" || type === "student") {
      setSelectedRole(type);
    }

    // Auto-clear stuck sessions
    if (searchParams?.get("clear") === "1") {
      supabase.auth.signOut().then(() => {
        router.replace('/login'); // Strip the ?clear=1 from url
      });
    }
  }, [searchParams, router, supabase.auth]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) {
      setError("Please select a role to continue.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      if (!authData?.user) throw new Error("Could not log in");

      const { data: profileData, error: profileError } = await supabase
        .from('portal_users')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (profileError) throw profileError;

      if (profileData.role !== selectedRole) {
        await supabase.auth.signOut();
        throw new Error('Invalid role selected for this account.');
      }

      const redirectTo = searchParams?.get('redirectedFrom') || '/dashboard';
      router.push(redirectTo);
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'An error occurred during sign in');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSelect = (role: "student" | "teacher" | "admin") => {
    setSelectedRole(role);
    setError(null);
    // Clear the form so users enter their real credentials
    setEmail('');
    setPassword('');
    setResetSent(false);
  };

  const handleForgotPassword = useCallback(async () => {
    if (!email.trim()) {
      setError('Enter your email address first, then click Forgot Password.');
      return;
    }
    setLoading(true);
    setError(null);
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (resetErr) setError(resetErr.message);
    else setResetSent(true);
  }, [email, supabase]);

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex overflow-hidden relative selection:bg-indigo-500/30">
      {/* Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-8 relative z-10 w-full">
        <div className="max-w-[1200px] mx-auto w-full">
          <div className="flex flex-col lg:flex-row gap-12 lg:gap-24 items-center">

            {/* Left side - Roles */}
            <div className="w-full lg:w-1/2 flex flex-col">
              <div className="mb-12">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-indigo-300 text-sm font-medium mb-6 backdrop-blur-md">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                  </span>
                  Welcome to RillCod Academy
                </div>
                <h2 className="text-5xl lg:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-100 to-white/70 tracking-tight leading-tight mb-4">
                  Choose Your <br className="hidden lg:block" /> Path.
                </h2>
                <p className="text-lg text-gray-400 font-light max-w-md">
                  Select your role to embark on an exceptional learning journey. Experience education reimagined.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { id: "student", icon: GraduationCap, title: "Student", desc: "Start learning", gradient: "from-blue-500/10 to-indigo-500/10", border: "border-indigo-500/20", hover: "hover:border-indigo-500/50 hover:bg-indigo-500/10", active: "border-indigo-500 bg-indigo-500/20 ring-1 ring-indigo-500/50 shadow-[0_0_30px_-5px_rgba(99,102,241,0.3)]", iconColor: "text-indigo-400" },
                  { id: "teacher", icon: User, title: "Teacher", desc: "Guide students", gradient: "from-emerald-500/10 to-teal-500/10", border: "border-teal-500/20", hover: "hover:border-teal-500/50 hover:bg-teal-500/10", active: "border-teal-500 bg-teal-500/20 ring-1 ring-teal-500/50 shadow-[0_0_30px_-5px_rgba(20,184,166,0.3)]", iconColor: "text-teal-400" },
                  { id: "admin", icon: Shield, title: "Admin", desc: "Manage academy", gradient: "from-purple-500/10 to-pink-500/10", border: "border-purple-500/20", hover: "hover:border-purple-500/50 hover:bg-purple-500/10", active: "border-purple-500 bg-purple-500/20 ring-1 ring-purple-500/50 shadow-[0_0_30px_-5px_rgba(168,85,247,0.3)]", iconColor: "text-purple-400" }
                ].map((role) => (
                  <button
                    key={role.id}
                    onClick={() => handleRoleSelect(role.id as any)}
                    className={`relative p-6 rounded-2xl border transition-all duration-300 ease-out flex flex-col items-start gap-4 text-left group overflow-hidden bg-white/[0.02] backdrop-blur-xl ${selectedRole === role.id ? role.active : `${role.border} ${role.hover}`
                      }`}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${role.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                    <div className={`p-3 rounded-xl bg-white/5 border border-white/10 ${role.iconColor} group-hover:scale-110 transition-transform duration-300`}>
                      <role.icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white mb-1">{role.title}</h3>
                      <p className="text-sm text-gray-500">{role.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right side - Login Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center">
              <div className="w-full max-w-md relative">
                {/* Form glow behind */}
                <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-blue-500 rounded-[2rem] blur-xl opacity-20" />

                <div className="relative bg-[#111113]/80 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-8 lg:p-10 shadow-2xl">


                  <div className="mb-8">
                    <h2 className="text-2xl font-bold text-white mb-2">Sign In</h2>
                    <p className="text-sm text-gray-400">Enter your credentials to access the portal.</p>
                  </div>

                  {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                      <div className="text-red-400 mt-0.5">
                        <Shield className="w-5 h-5" />
                      </div>
                      <p className="text-sm text-red-200">{error}</p>
                    </div>
                  )}

                  <form onSubmit={handleLogin} className="space-y-5">
                    <div className="space-y-1.5">
                      <label htmlFor="email" className="text-sm font-medium text-gray-300">Email</label>
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <Mail className="h-5 w-5 text-gray-500 group-focus-within:text-indigo-400 transition-colors" />
                        </div>
                        <input
                          id="email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 text-white placeholder-gray-500 transition-all outline-none"
                          placeholder="name@example.com"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label htmlFor="password" className="text-sm font-medium text-gray-300">Password</label>
                        <a
                          href="#"
                          onClick={(e) => { e.preventDefault(); handleForgotPassword(); }}
                          className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors">
                          Forgot password?
                        </a>
                      </div>
                      <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <Lock className="h-5 w-5 text-gray-500 group-focus-within:text-indigo-400 transition-colors" />
                        </div>
                        <input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full pl-12 pr-12 py-3.5 bg-white/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 text-white placeholder-gray-500 transition-all outline-none"
                          placeholder="••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-gray-300 transition-colors outline-none"
                        >
                          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !selectedRole}
                      className="w-full relative flex items-center justify-center gap-2 py-4 px-4 bg-white text-black rounded-xl font-bold text-sm tracking-wide hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#111113] focus:ring-white transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden group"
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/10 to-indigo-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                      {loading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Authenticating...
                        </>
                      ) : (
                        <>
                          Sign In to Portal
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </>
                      )}
                    </button>
                  </form>

                  {resetSent && (
                    <div className="mt-5 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-emerald-300">Password reset email sent! Check your inbox.</p>
                    </div>
                  )}

                  {selectedRole && !resetSent && (
                    <p className="mt-4 text-center text-xs text-gray-500">
                      Signing in as{' '}
                      <span className="text-gray-300 font-semibold capitalize">{selectedRole}</span>
                      {' · '}
                      <a href="/student-registration" className="text-indigo-400 hover:text-indigo-300 transition-colors">
                        New? Register here →
                      </a>
                    </p>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

