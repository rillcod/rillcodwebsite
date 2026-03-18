// @refresh reset
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ShieldCheckIcon,
    MagnifyingGlassIcon,
    CheckBadgeIcon,
    LockClosedIcon,
    AcademicCapIcon
} from '@/lib/icons';

export default function VerifyLandingPage() {
    const [code, setCode] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const router = useRouter();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!code.trim()) return;

        setIsSubmitting(true);
        // Construct the URL and navigate
        router.push(`/verify/${code.trim().toUpperCase()}`);
    };

    return (
        <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col font-sans selection:bg-violet-500/30">

            {/* Dynamic Background Elements */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-600/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px]" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[url('/images/grid.svg')] opacity-[0.03]" />
            </div>

            {/* Header */}
            <header className="relative z-10 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-3 group">
                        <div className="relative">
                            <div className="absolute inset-0 bg-violet-500 blur-lg opacity-20 group-hover:opacity-40 transition-opacity" />
                            <img src="/images/logo.png" alt="Rillcod" className="relative w-9 h-9 object-contain"
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </div>
                        <span className="font-black text-xl tracking-tight text-white group-hover:text-violet-400 transition-colors">
                            Rillcod<span className="text-violet-500">.</span>
                        </span>
                    </Link>

                    <div className="hidden md:flex items-center gap-8 text-[11px] font-black uppercase tracking-[0.2em] text-white/40">
                        <Link href="/about" className="hover:text-white transition-colors">Academy</Link>
                        <Link href="/curriculum" className="hover:text-white transition-colors">Curriculum</Link>
                        <Link href="/contact" className="hover:text-white transition-colors">Support</Link>
                    </div>

                    <div className="flex items-center gap-4">
                        <Link href="/login" className="px-5 py-2 text-xs font-bold text-white/60 hover:text-white transition-colors">
                            Sign In
                        </Link>
                        <Link href="/signup" className="px-5 py-2 bg-white text-black text-xs font-black rounded-full hover:bg-violet-50 transition-colors">
                            Get Started
                        </Link>
                    </div>
                </div>
            </header>

            <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-20">

                {/* Hero Section */}
                <div className="max-w-3xl w-full text-center space-y-12">

                    <div className="space-y-6">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-violet-500/10 border border-violet-500/20 rounded-full">
                            <ShieldCheckIcon className="w-4 h-4 text-violet-400" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-violet-400">Secure Verification Portal</span>
                        </div>

                        <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-[0.9] text-white">
                            Verify Academic <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400">Credentials.</span>
                        </h1>

                        <p className="text-lg text-white/40 max-w-xl mx-auto font-medium leading-relaxed">
                            Enter the unique verification code found on your Rillcod certificate or report card to validate its authenticity instantly.
                        </p>
                    </div>

                    {/* Verification Form */}
                    <form onSubmit={handleSubmit} className="relative max-w-lg mx-auto group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-[2rem] blur opacity-25 group-focus-within:opacity-50 transition duration-500" />

                        <div className="relative bg-[#12121e] border border-white/10 p-2.5 rounded-[1.8rem] flex items-center shadow-2xl">
                            <div className="pl-5 text-white/30">
                                <MagnifyingGlassIcon className="w-6 h-6" />
                            </div>
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder="Enter 8-character code (e.g. A1B2C3D4)"
                                className="flex-1 bg-transparent border-none focus:ring-0 text-lg font-bold placeholder:text-white/10 placeholder:font-medium px-4 h-14"
                                required
                                autoFocus
                                autoComplete="off"
                                spellCheck="false"
                            />
                            <button
                                type="submit"
                                disabled={isSubmitting || !code.trim()}
                                className="bg-white text-black h-14 px-8 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-violet-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                            >
                                {isSubmitting ? 'Verifying...' : 'Verify'}
                            </button>
                        </div>
                    </form>

                    {/* Trust Features */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-12">
                        {[
                            {
                                icon: <LockClosedIcon className="w-6 h-6" />,
                                title: "Tamper Proof",
                                desc: "Cryptography secured records ensuring data integrity."
                            },
                            {
                                icon: <CheckBadgeIcon className="w-6 h-6" />,
                                title: "Instant Results",
                                desc: "Access real-time verification status from our live database."
                            },
                            {
                                icon: <AcademicCapIcon className="w-6 h-6" />,
                                title: "Official Record",
                                desc: "Directly linked to Rillcod Technologies's institutional master."
                            }
                        ].map((feature, i) => (
                            <div key={i} className="text-center space-y-3 p-6 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors">
                                <div className="w-12 h-12 bg-violet-500/10 rounded-2xl flex items-center justify-center text-violet-400 mx-auto">
                                    {feature.icon}
                                </div>
                                <h3 className="font-bold text-white tracking-tight">{feature.title}</h3>
                                <p className="text-xs text-white/30 leading-relaxed font-medium">{feature.desc}</p>
                            </div>
                        ))}
                    </div>

                </div>
            </main>

            {/* Footer */}
            <footer className="relative z-10 border-t border-white/5 px-6 py-10">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
                    <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
                        © {new Date().getFullYear()} Rillcod Technologies · All Rights Reserved
                    </p>
                    <div className="flex gap-8">
                        <a href="mailto:rillcod@gmail.com" className="text-[10px] font-bold text-white/20 hover:text-white uppercase tracking-widest transition-colors">Contact Support</a>
                        <Link href="/privacy-policy" className="text-[10px] font-bold text-white/20 hover:text-white uppercase tracking-widest transition-colors">Privacy Policy</Link>
                        <Link href="/terms-of-service" className="text-[10px] font-bold text-white/20 hover:text-white uppercase tracking-widest transition-colors">Terms of Service</Link>
                    </div>
                </div>
            </footer>

        </div>
    );
}
