'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ShieldCheckIcon,
  XCircleIcon,
  ArrowLeftIcon,
  CheckBadgeIcon,
  AcademicCapIcon,
  CalendarIcon,
  DocumentTextIcon,
  BuildingOfficeIcon,
} from '@/lib/icons';

interface VerifiedSchoolReport {
  title: string;
  school: string;
  termLabel: string;
  academicYear: string;
  publishedAt: string;
  revision: number;
  code: string;
}

export default function VerifySchoolReportPage() {
  const { code } = useParams<{ code: string }>();

  const [report, setReport] = useState<VerifiedSchoolReport | null>(null);
  const [status, setStatus] = useState<'loading' | 'found' | 'notfound'>('loading');

  useEffect(() => {
    if (!code) {
      setStatus('notfound');
      return;
    }

    async function fetchData() {
      try {
        const cleanCode = String(code).trim().toUpperCase();
        const res = await fetch(`/api/public/verify-school-report?code=${encodeURIComponent(cleanCode)}`, {
          cache: 'no-store',
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json?.found && json.report) {
          setReport(json.report);
          setStatus('found');
        } else {
          setStatus('notfound');
        }
      } catch (err) {
        console.error('School report verification error:', err);
        setStatus('notfound');
      }
    }

    fetchData();
  }, [code]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans selection:bg-primary/20 public-page-root overflow-x-clip">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/5 rounded-full blur-[120px]" />
      </div>

      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link
            href="/verify/school-report"
            className="flex items-center gap-2 group text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">Report Verification</span>
          </Link>

          <Link href="/" className="flex items-center gap-2">
            <img
              src="/images/logo.png"
              alt="Rillcod"
              className="w-6 h-6 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <span className="font-black text-sm tracking-tight text-foreground">Rillcod Technologies</span>
          </Link>

          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-emerald-500">
            <ShieldCheckIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Official Public Ledger</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-start px-4 py-12">
        <div className="w-full max-w-3xl">
          {/* Loading state */}
          {status === 'loading' && (
            <div className="text-center py-32 space-y-5">
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 rounded-full border-[3px] border-primary/10" />
                <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-primary animate-spin" />
                <div
                  className="absolute inset-[10px] rounded-full border-[2px] border-transparent border-t-indigo-400 animate-spin"
                  style={{ animationDirection: 'reverse', animationDuration: '0.6s' }}
                />
              </div>
              <p className="text-muted-foreground text-[11px] font-black uppercase tracking-[0.2em]">
                Verifying Report Security Token…
              </p>
            </div>
          )}

          {/* Not found state */}
          {status === 'notfound' && (
            <div className="text-center py-24 space-y-8 max-w-md mx-auto">
              <div className="w-24 h-24 bg-rose-500/10 border border-rose-500/20 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-2xl shadow-rose-900/20">
                <XCircleIcon className="w-12 h-12 text-rose-500" />
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl font-black text-foreground tracking-tight">Record Not Found</h1>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  No published school performance report matches the verification token{' '}
                  <span className="bg-muted px-2.5 py-1 rounded-md text-foreground font-mono font-bold tracking-tight">
                    {code?.toUpperCase()}
                  </span>
                  .
                </p>
                <p className="text-muted-foreground text-xs pt-2">
                  Please verify the QR code on the original report book or check the code and try again.
                </p>
              </div>
              <Link
                href="/verify/school-report"
                className="inline-flex items-center gap-3 px-8 py-3.5 bg-primary text-primary-foreground font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-primary/90 transition-all active:scale-95 shadow-sm"
              >
                Enter Another Code
              </Link>
            </div>
          )}

          {/* Found state */}
          {status === 'found' && report && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">
              {/* Verification Seal Banner */}
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-[2rem] blur opacity-15" />
                <div className="relative flex flex-col md:flex-row items-center gap-6 px-8 py-6 bg-card border border-emerald-500/30 rounded-[1.8rem] shadow-2xl">
                  <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <ShieldCheckIcon className="w-10 h-10 text-emerald-500" />
                  </div>
                  <div className="flex-1 text-center md:text-left space-y-1">
                    <div className="flex items-center justify-center md:justify-start gap-2">
                      <p className="font-black text-emerald-500 text-sm uppercase tracking-[0.2em]">
                        Verified — Authentic School Report
                      </p>
                      <CheckBadgeIcon className="w-4 h-4 text-emerald-500" />
                    </div>
                    <p className="text-muted-foreground text-[11px] font-medium leading-relaxed max-w-lg">
                      Official institutional report record confirmed against the Rillcod Technologies verification ledger.
                      Security token <span className="font-mono font-bold text-foreground">{report.code}</span> is genuine and tamper-evident.
                    </p>
                  </div>
                </div>
              </div>

              {/* Report Information Card */}
              <div className="rounded-3xl border border-border/80 bg-card p-6 sm:p-8 shadow-sm space-y-6">
                <div className="border-b border-border/60 pb-6">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-primary">
                    <BuildingOfficeIcon className="w-4 h-4" />
                    <span>{report.school}</span>
                  </div>
                  <h2 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                    {report.title}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {report.termLabel} · Academic Year {report.academicYear}
                  </p>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <CalendarIcon className="w-4 h-4" />
                      <span className="text-[10px] font-black uppercase tracking-wider">Date Published</span>
                    </div>
                    <p className="text-sm font-black text-foreground">
                      {report.publishedAt ? new Date(report.publishedAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      }) : 'Published'}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                    <div className="flex items-center gap-2 text-muted-foreground mb-1">
                      <DocumentTextIcon className="w-4 h-4" />
                      <span className="text-[10px] font-black uppercase tracking-wider">Official Revision</span>
                    </div>
                    <p className="text-sm font-black text-foreground">
                      Revision {report.revision || 1} (Final Authorized Release)
                    </p>
                  </div>
                </div>

                {/* Security Verification Footprint */}
                <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Cryptographic Verification Hash
                  </p>
                  <p className="font-mono text-xs font-bold text-foreground break-all">
                    {report.code}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    This document was officially signed and sealed by Rillcod Technologies on behalf of {report.school}.
                  </p>
                </div>
              </div>

              {/* Navigation Actions */}
              <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
                <Link
                  href="/verify/school-report"
                  className="rounded-xl border border-border px-5 py-2.5 text-xs font-bold text-foreground hover:bg-muted transition-colors"
                >
                  Verify Another Document
                </Link>
                <Link
                  href="/"
                  className="rounded-xl bg-primary px-5 py-2.5 text-xs font-black text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Visit Rillcod Academy
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} Rillcod Technologies. All rights reserved. Built for institutional integrity.</p>
      </footer>
    </div>
  );
}
