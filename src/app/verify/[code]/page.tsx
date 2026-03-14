// @refresh reset
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  ShieldCheckIcon, XCircleIcon, ClockIcon,
  ArrowLeftIcon, CheckBadgeIcon,
  AcademicCapIcon, CalendarIcon, DocumentTextIcon,
  ArrowDownTrayIcon
} from '@/lib/icons';
import { ScaledReportCard } from '@/lib/pdf-utils';
import ReportCard from '@/components/reports/ReportCard';

export default function VerifyCodePage() {
  const { code } = useParams<{ code: string }>();

  const [report, setReport] = useState<any | null>(null);
  const [orgSettings, setOrgSettings] = useState<any | null>(null);
  const [certificate, setCertificate] = useState<any | null>(null);
  const [mode, setMode] = useState<'report' | 'certificate' | null>(null);
  const [status, setStatus] = useState<'loading' | 'found' | 'notfound' | 'unpublished'>('loading');

  useEffect(() => {
    if (!code) { setStatus('notfound'); return; }

    const db = createClient();

    async function fetchData() {
      try {
        // 1. Try fetching as a report (using ILIKE for partial match)
        const { data: reportData, error: reportError } = await db
          .from('student_progress_reports')
          .select('*')
          .ilike('id', `${code.toLowerCase()}%`)
          .limit(1)
          .maybeSingle();

        if (!reportError && reportData) {
          if (!reportData.is_published) {
            setStatus('unpublished');
            return;
          }

          const { data: orgData } = await db
            .from('report_settings')
            .select('*')
            .limit(1)
            .maybeSingle();

          setReport(reportData);
          setOrgSettings(orgData);
          setMode('report');
          setStatus('found');
          return;
        }

        // 2. Try fetching as a certificate (using EXACT verification_code)
        const { data: certData, error: certError } = await db
          .from('certificates')
          .select('*, portal_users(full_name), courses(title)')
          .eq('verification_code', code.toUpperCase())
          .maybeSingle();

        if (!certError && certData) {
          setCertificate(certData);
          setMode('certificate');
          setStatus('found');
          return;
        }

        setStatus('notfound');
      } catch (err) {
        console.error('Verification error:', err);
        setStatus('notfound');
      }
    }

    fetchData();
  }, [code]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col font-sans selection:bg-violet-500/30">

      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/5 rounded-full blur-[120px]" />
      </div>

      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/verify" className="flex items-center gap-2 group text-white/40 hover:text-white transition-colors">
            <ArrowLeftIcon className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">Verification Center</span>
          </Link>

          <Link href="/" className="flex items-center gap-2">
            <img src="/images/logo.png" alt="Rillcod" className="w-6 h-6 object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <span className="font-black text-sm tracking-tight text-white/90">Rillcod Academy</span>
          </Link>

          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-emerald-400">
            <ShieldCheckIcon className="w-3.5 h-3.5" />
            Secure Node Verified
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-start px-4 py-12">
        <div className="w-full max-w-4xl">

          {/* Loading */}
          {status === 'loading' && (
            <div className="text-center py-32 space-y-5">
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 rounded-full border-[3px] border-violet-500/10" />
                <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-violet-500 animate-spin" />
                <div className="absolute inset-[10px] rounded-full border-[2px] border-transparent border-t-indigo-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.6s' }} />
              </div>
              <p className="text-white/40 text-[11px] font-black uppercase tracking-[0.2em]">Verifying Authorization Token…</p>
            </div>
          )}

          {/* Not found */}
          {status === 'notfound' && (
            <div className="text-center py-24 space-y-8 max-w-md mx-auto">
              <div className="w-24 h-24 bg-rose-500/10 border border-rose-500/20 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-2xl shadow-rose-900/20">
                <XCircleIcon className="w-12 h-12 text-rose-400" />
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl font-black text-white tracking-tight">Record Not Found</h1>
                <p className="text-white/40 text-sm leading-relaxed">
                  No published institutional report or certificate matches the verification code <span className="bg-white/10 px-2.5 py-1 rounded-md text-white font-mono font-bold tracking-tight">{code?.toUpperCase()}</span>.
                </p>
                <p className="text-white/20 text-xs pt-2">Please verify the code on the printed certificate or QR code URL and try again.</p>
              </div>
              <Link href="/verify" className="inline-flex items-center gap-3 px-8 py-3.5 bg-white text-black font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-violet-50 transition-all active:scale-95">
                New Search
              </Link>
            </div>
          )}

          {/* Unpublished */}
          {status === 'unpublished' && (
            <div className="text-center py-24 space-y-8 max-w-md mx-auto">
              <div className="w-24 h-24 bg-amber-500/10 border border-amber-500/20 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-2xl shadow-amber-900/20">
                <ClockIcon className="w-12 h-12 text-amber-400" />
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl font-black text-white tracking-tight">Access Restricted</h1>
                <p className="text-white/40 text-sm leading-relaxed">
                  This report exists in our database but has not been officially published for public verification by the Rillcod Academy board.
                </p>
              </div>
              <Link href="/verify" className="inline-flex items-center gap-3 px-8 py-3.5 bg-white/10 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-white/15 transition-all outline outline-1 outline-white/10">
                Back to Center
              </Link>
            </div>
          )}

          {/* Found */}
          {status === 'found' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">

              {/* Success Banner */}
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-[2rem] blur opacity-15" />
                <div className="relative flex flex-col md:flex-row items-center gap-6 px-8 py-6 bg-[#0d1410] border border-emerald-500/20 rounded-[1.8rem] shadow-2xl">
                  <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <ShieldCheckIcon className="w-10 h-10 text-emerald-400" />
                  </div>
                  <div className="flex-1 text-center md:text-left space-y-1">
                    <div className="flex items-center justify-center md:justify-start gap-2">
                      <p className="font-black text-emerald-400 text-sm uppercase tracking-[0.2em]">{mode === 'report' ? 'Verified — Authentic Report' : 'Verified — Authentic Certificate'}</p>
                      <CheckBadgeIcon className="w-4 h-4 text-emerald-500" />
                    </div>
                    <p className="text-emerald-400/50 text-[11px] font-medium leading-relaxed max-w-lg">
                      Institutional record confirmed against Rillcod Academy master ledger.
                      Authorization token <span className="font-mono text-emerald-400/80 font-bold">{code?.toUpperCase()}</span> is valid.
                    </p>
                  </div>
                </div>
              </div>

              {/* MODE: Report Display */}
              {mode === 'report' && report && (
                <div className="space-y-12">
                  {/* The Actual Report Card */}
                  <div className="relative">
                    <div className="absolute -inset-4 bg-white/5 rounded-[3rem] blur-2xl -z-10" />
                    <div className="bg-white rounded-[2.5rem] overflow-hidden shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)]">
                      <ScaledReportCard report={report}>
                        <ReportCard report={report} orgSettings={orgSettings} />
                      </ScaledReportCard>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row items-center justify-center gap-4">
                    <button
                      onClick={() => window.print()}
                      className="px-8 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-colors"
                    >
                      Print Report
                    </button>
                    <Link
                      href="/verify"
                      className="px-8 py-3.5 bg-violet-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-violet-500 transition-all shadow-lg shadow-violet-900/20 active:scale-95 text-center"
                    >
                      New Verification
                    </Link>
                  </div>
                </div>
              )}

              {/* MODE: Certificate Display */}
              {mode === 'certificate' && certificate && (
                <div className="space-y-12">
                  <div className="bg-[#12121e] border border-white/5 rounded-[2.5rem] p-10 shadow-2xl space-y-10">

                    {/* Certificate Visual */}
                    <div className="flex items-center justify-center py-6">
                      <div className="relative">
                        <div className="absolute inset-0 bg-violet-500 blur-[80px] opacity-20" />
                        <div className="relative w-48 h-48 bg-white/[0.03] border border-white/10 rounded-full flex flex-col items-center justify-center gap-4 backdrop-blur-3xl shadow-2xl">
                          <AcademicCapIcon className="w-20 h-20 text-violet-400" />
                          <div className="flex gap-1.5 translate-y-2">
                            {[1, 2, 3, 4, 5].map(i => <div key={i} className="w-1 h-1 rounded-full bg-violet-500" />)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="text-center space-y-4">
                      <h2 className="text-4xl font-black tracking-tight text-white leading-tight">
                        {certificate.portal_users?.full_name}<br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400">
                          Certificated Expert
                        </span>
                      </h2>
                      <p className="text-white/30 text-xs font-black uppercase tracking-[0.3em]">Institutional Completion Certificate</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-white/5 rounded-[2rem] overflow-hidden border border-white/5">
                      {[
                        { label: 'Programme', value: certificate.courses?.title, icon: <DocumentTextIcon className="w-5 h-5" /> },
                        { label: 'Issue Date', value: new Date(certificate.issued_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }), icon: <CalendarIcon className="w-5 h-5" /> },
                        { label: 'Certificate No.', value: certificate.certificate_number, icon: <CheckBadgeIcon className="w-5 h-5" /> },
                        { label: 'Verify Code', value: certificate.verification_code, icon: <ShieldCheckIcon className="w-5 h-5" /> },
                      ].map((item, i) => (
                        <div key={i} className="bg-[#161625] p-6 flex items-start gap-4">
                          <div className="w-10 h-10 bg-white/[0.03] rounded-xl flex items-center justify-center text-white/40">
                            {item.icon}
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">{item.label}</p>
                            <p className="text-sm font-bold text-white/80">{item.value}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {certificate.pdf_url && (
                      <div className="flex justify-center pt-4">
                        <a
                          href={`/api/files/${certificate.pdf_url}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 text-violet-400 hover:text-white transition-colors text-xs font-black uppercase tracking-widest"
                        >
                          <ArrowDownTrayIcon className="w-4 h-4" /> Download Official PDF
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col md:flex-row items-center justify-center gap-4">
                    <Link
                      href="/verify"
                      className="px-8 py-3.5 bg-violet-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-violet-500 transition-all shadow-lg shadow-violet-900/20 active:scale-95 text-center"
                    >
                      Verify Another Code
                    </Link>
                  </div>
                </div>
              )}

              {/* Disclaimer */}
              <div className="max-w-2xl mx-auto text-center space-y-4 px-6 opacity-30 mt-20">
                <p className="text-[10px] font-bold text-white uppercase tracking-[0.2em] leading-relaxed">
                  Institutional Disclosure
                </p>
                <p className="text-[11px] leading-relaxed font-medium">
                  This verification portal validates Rillcod Academy credentials. Any attempt to forge, alter, or misrepresent these records is a violation of international academic standards. For legal inquiries or discrepancies, contact <a href="mailto:rillcod@gmail.com" className="underline hover:text-white transition-colors">rillcod@gmail.com</a>.
                </p>
              </div>

            </div>
          )}
        </div>
      </main>

      <footer className="mt-auto border-t border-white/5 px-6 py-10 text-center bg-[#0a0a0f]">
        <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest">
          © {new Date().getFullYear()} Rillcod Technologies · Secure Verification Framework v3.0 (Master-Sync)
        </p>
      </footer>
    </div>
  );
}
