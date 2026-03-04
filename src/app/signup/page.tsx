"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Lock, Eye, EyeOff, User, GraduationCap, Shield, ArrowRight, Loader2, CheckCircle, Building2, ArrowLeft } from "lucide-react";

type UserRole = 'admin' | 'teacher' | 'student';

const ROLES = [
  {
    id: 'student' as UserRole,
    label: 'Student',
    desc: 'Join a STEM programme',
    icon: GraduationCap,
    gradient: 'from-blue-600 to-indigo-600',
    border: 'border-indigo-500/50',
    glow: 'shadow-indigo-500/20',
    ring: 'ring-indigo-500',
  },
  {
    id: 'teacher' as UserRole,
    label: 'Teacher',
    desc: 'Teach and manage classes',
    icon: User,
    gradient: 'from-emerald-600 to-teal-600',
    border: 'border-teal-500/50',
    glow: 'shadow-teal-500/20',
    ring: 'ring-teal-500',
  },
  {
    id: 'school' as any, // Adding school role
    label: 'School',
    desc: 'Manage institution',
    icon: Building2,
    gradient: 'from-orange-600 to-red-600',
    border: 'border-orange-500/50',
    glow: 'shadow-orange-500/20',
    ring: 'ring-orange-500',
  },
  {
    id: 'admin' as UserRole,
    label: 'Admin',
    desc: 'Manage the platform',
    icon: Shield,
    gradient: 'from-purple-600 to-pink-600',
    border: 'border-purple-500/50',
    glow: 'shadow-purple-500/20',
    ring: 'ring-purple-500',
  },
];

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedRole, setRole] = useState<UserRole | null>(null);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) { toast.error("Please select a role to continue"); return; }
    if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName, role: selectedRole }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to sign up');

      toast.success("Account created! Please sign in.");
      router.push('/login');
    } catch (error: any) {
      if (error.message?.includes('duplicate key') || error.message?.includes('already exists')) {
        toast.error("An account with this email already exists");
      } else {
        toast.error(error.message || "An error occurred during signup");
      }
    } finally {
      setLoading(false);
    }
  };

  const strength = (() => {
    if (!password) return 0;
    let s = 0;
    if (password.length >= 8) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  })();

  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const strengthColor = ['', 'bg-rose-500', 'bg-amber-500', 'bg-yellow-400', 'bg-emerald-500'];

  return (
    <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Background orbs */}
      <div className="absolute top-[-15%] left-[-10%] w-[50%] h-[50%] bg-violet-700/15 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[45%] h-[45%] bg-blue-700/15 rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">

        <div className="absolute top-4 left-4 z-50">
          <Link href="/" className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white/70 hover:text-white transition-all backdrop-blur-md">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back to Home</span>
          </Link>
        </div>

        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-black text-white">Rillcod <span className="text-violet-400">Academy</span></span>
          </Link>
          <h1 className="text-3xl font-extrabold text-white mt-6">Create account</h1>
          <p className="text-white/40 text-sm mt-1.5">Join thousands of learners across Nigeria</p>
        </div>

        {/* Card */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-7 shadow-2xl backdrop-blur-md">

          {/* Role selection */}
          <div className="mb-6">
            <p className="text-xs font-bold text-white/40 uppercase tracking-widest mb-3">I am a…</p>
            <div className="grid grid-cols-3 gap-2.5">
              {ROLES.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRole(r.id)}
                  className={`relative flex flex-col items-center gap-2 p-3.5 rounded-2xl border-2 transition-all duration-200
                    ${selectedRole === r.id
                      ? `bg-gradient-to-br ${r.gradient} ${r.border} shadow-lg ${r.glow}`
                      : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'}`}>
                  {selectedRole === r.id && (
                    <span className="absolute top-2 right-2">
                      <CheckCircle className="w-3.5 h-3.5 text-white" />
                    </span>
                  )}
                  <r.icon className={`w-5 h-5 ${selectedRole === r.id ? 'text-white' : 'text-white/40'}`} />
                  <span className={`text-xs font-bold ${selectedRole === r.id ? 'text-white' : 'text-white/50'}`}>{r.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSignUp} className="space-y-4">

            {/* Full name */}
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Full Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-white/25 focus:outline-none focus:border-violet-500 focus:bg-white/8 transition-all" />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-white/25 focus:outline-none focus:border-violet-500 focus:bg-white/8 transition-all" />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                <input type={showPw ? "text" : "password"} required value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full pl-10 pr-10 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-white/25 focus:outline-none focus:border-violet-500 focus:bg-white/8 transition-all" />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {/* Strength bar */}
              {password && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className={`flex-1 h-1 rounded-full transition-all ${i <= strength ? strengthColor[strength] : 'bg-white/10'}`} />
                    ))}
                  </div>
                  <p className={`text-[11px] mt-1 font-semibold ${strengthColor[strength].replace('bg-', 'text-').replace('500', '400')}`}>
                    {strengthLabel[strength]}
                  </p>
                </div>
              )}
            </div>

            {/* Submit */}
            <button type="submit" disabled={loading || !selectedRole}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg shadow-violet-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          {/* Footer */}
          <p className="text-center text-sm text-white/30 mt-5">
            Already have an account?{' '}
            <Link href="/login" className="text-violet-400 hover:text-violet-300 font-semibold transition-colors">
              Sign in
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-white/20 mt-6">
          By creating an account you agree to our{' '}
          <Link href="/terms-of-service" className="underline hover:text-white/40">Terms</Link>
          {' '}and{' '}
          <Link href="/privacy-policy" className="underline hover:text-white/40">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}