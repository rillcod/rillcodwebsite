'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ShieldCheckIcon,
  MagnifyingGlassIcon,
  CheckBadgeIcon,
  BuildingOfficeIcon,
  DocumentTextIcon,
} from '@/lib/icons';

export default function SchoolReportVerifyLandingPage() {
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    setIsSubmitting(true);
    router.push(`/verify/school-report/${encodeURIComponent(clean)}`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans selection:bg-primary/20 public-page-root overflow-x-clip">
      {/* Dynamic Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/5 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <img
              src="/images/logo.png"
              alt="Rillcod"
              className="w-8 h-8 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <span className="font-black text-xl tracking-tight text-foreground">
              Rillcod Technologies
            </span>
          </Link>

          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-500">
            <ShieldCheckIcon className="w-4 h-4" />
            <span>Public Document Verification</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-20">
        <div className="w-full max-w-2xl text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-primary/20 bg-primary/10 text-primary text-xs font-black uppercase tracking-widest">
            <BuildingOfficeIcon className="w-4 h-4" />
            Institutional Performance Records
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl font-black text-foreground tracking-tight">
              Verify School Performance Report
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base max-w-lg mx-auto leading-relaxed">
              Enter the 20-character verification code printed on the official Rillcod Academy School Performance Report or found below the QR code.
            </p>
          </div>

          {/* Verification Form */}
          <form onSubmit={handleSubmit} className="relative max-w-xl mx-auto">
            <div className="relative flex flex-col sm:flex-row items-center gap-2 rounded-2xl border border-border/80 bg-card p-2 shadow-2xl">
              <div className="relative flex-1 w-full">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. SR-A1B2C3D4E5F6..."
                  className="w-full bg-transparent px-4 py-3.5 text-sm sm:text-base font-mono font-bold uppercase tracking-wider text-foreground placeholder:text-muted-foreground/50 placeholder:font-sans placeholder:normal-case placeholder:tracking-normal outline-none"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting || !code.trim()}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-primary text-primary-foreground font-black text-xs uppercase tracking-widest hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0 shadow-sm"
              >
                <MagnifyingGlassIcon className="w-4 h-4" />
                {isSubmitting ? 'Verifying…' : 'Verify'}
              </button>
            </div>
          </form>

          {/* Trust badges */}
          <div className="pt-8 flex flex-wrap items-center justify-center gap-8 text-xs font-bold text-muted-foreground">
            <div className="flex items-center gap-2">
              <CheckBadgeIcon className="w-4 h-4 text-emerald-500" />
              <span>Tamper-Evident SHA-256 Ledger</span>
            </div>
            <div className="flex items-center gap-2">
              <DocumentTextIcon className="w-4 h-4 text-primary" />
              <span>Official Institutional Seals</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} Rillcod Technologies. Institutional Document Verification Portal.</p>
      </footer>
    </div>
  );
}
