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
  ArrowDownTrayIcon, CreditCardIcon, ChartBarIcon,
} from '@/lib/icons';
import { ScaledReportCard } from '@/lib/pdf-utils';
import ReportCard from '@/components/reports/ReportCard';

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Data-driven academic insights shown above the scanned report: class position,
// score, fee clearance, a progress trend across terms, and a per-session summary.
function ResultInsights({ report, otherReports, classRank }: {
  report: any; otherReports: any[]; classRank: { position: number; classSize: number } | null;
}) {
  const trend = [...otherReports]
    .filter(r => typeof r.overall_score === 'number')
    .sort((a, b) => new Date(a.report_date || 0).getTime() - new Date(b.report_date || 0).getTime());
  const maxScore = Math.max(1, ...trend.map(r => r.overall_score));

  const sessions: Record<string, any[]> = {};
  for (const r of otherReports) {
    const key = r.report_period || 'Session';
    (sessions[key] ||= []).push(r);
  }
  const currentSession = report.report_period || null;

  const feeStatus = (report.fee_status || '').toString().toLowerCase();
  const feeCleared = feeStatus.includes('paid') || feeStatus.includes('clear');
  const hasFee = !!report.fee_status;

  if (!classRank && !hasFee && trend.length <= 1 && Object.keys(sessions).length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
      <div className="flex items-center gap-2">
        <ChartBarIcon className="w-4 h-4 text-primary" />
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Academic Insights</span>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-2">
        {classRank && (
          <span className="px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-black">
            Class Position: {ordinal(classRank.position)} of {classRank.classSize}
          </span>
        )}
        {typeof report.overall_score === 'number' && (
          <span className="px-3 py-1.5 rounded-xl bg-muted border border-border text-foreground text-xs font-black">
            Overall: {report.overall_score}{report.overall_grade ? ` · ${report.overall_grade}` : ''}
          </span>
        )}
        {hasFee && (
          <span className={`px-3 py-1.5 rounded-xl text-xs font-black border ${feeCleared ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
            {feeCleared ? 'Fees Cleared' : `Fees: ${report.fee_status}`}
          </span>
        )}
      </div>

      {/* Progress trend across terms */}
      {trend.length > 1 && (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Progress Across Terms</p>
          <div className="space-y-2">
            {trend.map((r, i) => {
              const prev = i > 0 ? trend[i - 1].overall_score : null;
              const delta = prev != null ? r.overall_score - prev : null;
              const pct = Math.round((r.overall_score / maxScore) * 100);
              const isCurrent = r.verification_code === report.verification_code;
              return (
                <div key={r.id} className="flex items-center gap-3">
                  <span className={`w-36 sm:w-44 flex-shrink-0 truncate text-[11px] font-bold ${isCurrent ? 'text-primary' : 'text-muted-foreground'}`}>
                    {[r.report_term, r.report_period].filter(Boolean).join(' · ') || 'Term'}
                  </span>
                  <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${isCurrent ? 'bg-primary' : 'bg-primary/50'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-16 flex-shrink-0 text-right text-[11px] font-black text-foreground">
                    {r.overall_score}{r.overall_grade ? ` ${r.overall_grade}` : ''}
                  </span>
                  <span className={`w-5 flex-shrink-0 text-[11px] font-black ${delta == null ? 'text-transparent' : delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-muted-foreground'}`}>
                    {delta == null ? '' : delta > 0 ? '▲' : delta < 0 ? '▼' : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-session (annual) summary */}
      {Object.keys(sessions).length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Session Summary</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(sessions).map(([period, rs]) => {
              const scored = rs.filter(r => typeof r.overall_score === 'number');
              const avg = scored.length ? Math.round(scored.reduce((s, r) => s + r.overall_score, 0) / scored.length) : null;
              return (
                <div key={period} className={`p-4 rounded-xl border ${period === currentSession ? 'border-primary/30 bg-primary/5' : 'border-border bg-background'}`}>
                  <p className="text-xs font-black text-foreground">{period}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {rs.length} term{rs.length !== 1 ? 's' : ''}{avg != null ? ` · session average ${avg}` : ''}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function VerifyCodePage() {
  const { code } = useParams<{ code: string }>();

  const [report, setReport] = useState<any | null>(null);
  const [orgSettings, setOrgSettings] = useState<any | null>(null);
  const [otherReports, setOtherReports] = useState<any[]>([]);
  const [activeCode, setActiveCode] = useState<string>('');
  const [switching, setSwitching] = useState(false);
  const [classRank, setClassRank] = useState<{ position: number; classSize: number } | null>(null);
  const [certificate, setCertificate] = useState<any | null>(null);
  const [card, setCard] = useState<any | null>(null);
  const [mode, setMode] = useState<'report' | 'certificate' | 'card' | null>(null);
  const [status, setStatus] = useState<'loading' | 'found' | 'notfound' | 'unpublished' | 'revoked' | 'expired'>('loading');

  useEffect(() => {
    if (!code) { setStatus('notfound'); return; }

    const db = createClient();

    async function fetchData() {
      try {
        // 1. Try fetching as a published report via public API (uses service role — bypasses RLS)
        const reportRes = await fetch(`/api/public/verify-report?code=${encodeURIComponent(code)}`);
        if (reportRes.ok) {
          const reportJson = await reportRes.json();
          if (reportJson.found && reportJson.report) {
            setReport(reportJson.report);
            setOrgSettings(reportJson.orgSettings);
            setOtherReports(reportJson.otherReports ?? []);
            setClassRank(reportJson.classRank ?? null);
            setActiveCode(reportJson.report.verification_code ?? String(code).toUpperCase());
            setMode('report');
            setStatus('found');
            return;
          }
        } else if (reportRes.status === 403) {
          // Report exists but is not published
          setStatus('unpublished');
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

        // 3. Try as an identity card verification code
        const cardRes = await fetch(`/api/cards/verify-public?code=${encodeURIComponent(code.toUpperCase())}`);
        if (cardRes.ok) {
          const cardJson = await cardRes.json();
          if (cardJson.card) {
            setCard(cardJson);
            setMode('card');
            setStatus(cardJson.valid ? 'found' : cardJson.result === 'revoked' ? 'revoked' : 'expired');
            return;
          }
        }

        setStatus('notfound');
      } catch (err) {
        console.error('Verification error:', err);
        setStatus('notfound');
      }
    }

    fetchData();
  }, [code]);

  // Switch to another published term/year for the SAME student (school use case).
  async function loadReportByCode(vcode: string) {
    if (!vcode || vcode === activeCode) return;
    setSwitching(true);
    try {
      const res = await fetch(`/api/public/verify-report?code=${encodeURIComponent(vcode)}`);
      const json = await res.json();
      if (res.ok && json.found && json.report) {
        setReport(json.report);
        setOrgSettings(json.orgSettings);
        if (json.otherReports?.length) setOtherReports(json.otherReports);
        setClassRank(json.classRank ?? null);
        setActiveCode(json.report.verification_code ?? vcode);
      }
    } catch { /* keep current report on failure */ }
    finally { setSwitching(false); }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans selection:bg-primary/20">

      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-600/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/5 rounded-full blur-[120px]" />
      </div>

      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/verify" className="flex items-center gap-2 group text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeftIcon className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">Verification Center</span>
          </Link>

          <Link href="/" className="flex items-center gap-2">
            <img src="/images/logo.png" alt="Rillcod" className="w-6 h-6 object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <span className="font-black text-sm tracking-tight text-foreground">Rillcod Technologies</span>
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
              <p className="text-muted-foreground text-[11px] font-black uppercase tracking-[0.2em]">Verifying Authorization Token…</p>
            </div>
          )}

          {/* Not found */}
          {status === 'notfound' && (
            <div className="text-center py-24 space-y-8 max-w-md mx-auto">
              <div className="w-24 h-24 bg-rose-500/10 border border-rose-500/20 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-2xl shadow-rose-900/20">
                <XCircleIcon className="w-12 h-12 text-rose-400" />
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl font-black text-foreground tracking-tight">Record Not Found</h1>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  No published institutional report or certificate matches the verification code <span className="bg-muted px-2.5 py-1 rounded-md text-foreground font-mono font-bold tracking-tight">{code?.toUpperCase()}</span>.
                </p>
                <p className="text-muted-foreground text-xs pt-2">Please verify the code on the printed certificate or QR code URL and try again.</p>
              </div>
              <Link href="/verify" className="inline-flex items-center gap-3 px-8 py-3.5 bg-primary text-primary-foreground font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-primary/90 transition-all active:scale-95">
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
                <h1 className="text-3xl font-black text-foreground tracking-tight">Access Restricted</h1>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  This report exists in our database but has not been officially published for public verification by the Rillcod Technologies board.
                </p>
              </div>
              <Link href="/verify" className="inline-flex items-center gap-3 px-8 py-3.5 bg-muted text-foreground font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-muted/80 transition-all border border-border">
                Back to Center
              </Link>
            </div>
          )}

          {/* Revoked */}
          {status === 'revoked' && (
            <div className="text-center py-24 space-y-8 max-w-md mx-auto">
              <div className="w-24 h-24 bg-rose-500/10 border border-rose-500/20 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-2xl shadow-rose-900/20">
                <XCircleIcon className="w-12 h-12 text-rose-400" />
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl font-black text-foreground tracking-tight">Card Revoked</h1>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  The access card with verification code <span className="bg-muted px-2.5 py-1 rounded-md text-foreground font-mono font-bold tracking-tight">{code?.toUpperCase()}</span> has been revoked and is no longer valid.
                </p>
              </div>
              <Link href="/verify" className="inline-flex items-center gap-3 px-8 py-3.5 bg-muted text-foreground font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-muted/80 transition-all border border-border">
                Verify Another
              </Link>
            </div>
          )}

          {/* Expired */}
          {status === 'expired' && (
            <div className="text-center py-24 space-y-8 max-w-md mx-auto">
              <div className="w-24 h-24 bg-amber-500/10 border border-amber-500/20 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-2xl shadow-amber-900/20">
                <ClockIcon className="w-12 h-12 text-amber-400" />
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl font-black text-foreground tracking-tight">Card Expired</h1>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  The access card with verification code <span className="bg-muted px-2.5 py-1 rounded-md text-foreground font-mono font-bold tracking-tight">{code?.toUpperCase()}</span> has expired.
                </p>
              </div>
              <Link href="/verify" className="inline-flex items-center gap-3 px-8 py-3.5 bg-muted text-foreground font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-muted/80 transition-all border border-border">
                Verify Another
              </Link>
            </div>
          )}

          {/* Found */}
          {status === 'found' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700">

              {/* Success Banner */}
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-[2rem] blur opacity-15" />
                <div className="relative flex flex-col md:flex-row items-center gap-6 px-8 py-6 bg-card border border-emerald-500/20 rounded-[1.8rem] shadow-2xl">
                  <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <ShieldCheckIcon className="w-10 h-10 text-emerald-400" />
                  </div>
                  <div className="flex-1 text-center md:text-left space-y-1">
                    <div className="flex items-center justify-center md:justify-start gap-2">
                      <p className="font-black text-emerald-400 text-sm uppercase tracking-[0.2em]">{mode === 'report' ? 'Verified — Authentic Report' : mode === 'certificate' ? 'Verified — Authentic Certificate' : 'Verified — Valid Access Card'}</p>
                      <CheckBadgeIcon className="w-4 h-4 text-emerald-500" />
                    </div>
                    <p className="text-emerald-400/50 text-[11px] font-medium leading-relaxed max-w-lg">
                      Institutional record confirmed against Rillcod Technologies master ledger.
                      Authorization token <span className="font-mono text-emerald-400/80 font-bold">{code?.toUpperCase()}</span> is valid.
                    </p>
                  </div>
                </div>
              </div>

              {/* MODE: Report Display */}
              {mode === 'report' && report && (
                <div className="space-y-12">
                  {/* Academic year / term selector — lets a school view this student's
                      other published terms instead of only the scanned one. */}
                  {otherReports.length > 1 && (
                    <div className="bg-card border border-border rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex items-center gap-2 text-muted-foreground flex-shrink-0">
                        <CalendarIcon className="w-4 h-4 text-primary" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Academic Year / Term</span>
                      </div>
                      <select
                        value={activeCode}
                        onChange={e => loadReportByCode(e.target.value)}
                        disabled={switching}
                        className="flex-1 px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors disabled:opacity-60 cursor-pointer"
                      >
                        {otherReports.map(r => (
                          <option key={r.id} value={r.verification_code ?? ''}>
                            {[r.report_period, r.report_term, r.course_name].filter(Boolean).join(' — ') || 'Report'}
                            {r.overall_grade ? ` (${r.overall_grade})` : ''}
                          </option>
                        ))}
                      </select>
                      {switching && (
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary animate-pulse flex-shrink-0">Loading…</span>
                      )}
                    </div>
                  )}

                  {/* Academic insights — class position, progress trend, session summary */}
                  <ResultInsights report={report} otherReports={otherReports} classRank={classRank} />

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
                      className="px-8 py-3.5 bg-white/5 border border-border rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-colors"
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
                  <div className="bg-[#12121e] border border-border rounded-[2.5rem] p-10 shadow-2xl space-y-10">

                    {/* Certificate Visual */}
                    <div className="flex items-center justify-center py-6">
                      <div className="relative">
                        <div className="absolute inset-0 bg-violet-500 blur-[80px] opacity-20" />
                        <div className="relative w-48 h-48 bg-white/[0.03] border border-border rounded-full flex flex-col items-center justify-center gap-4 backdrop-blur-3xl shadow-2xl">
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-white/5 rounded-[2rem] overflow-hidden border border-border">
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

              {/* MODE: Card Display */}
              {mode === 'card' && card && (
                <div className="space-y-12">
                  <div className="bg-[#12121e] border border-border rounded-[2.5rem] p-10 shadow-2xl space-y-10">

                    {/* Card Visual */}
                    <div className="flex items-center justify-center py-6">
                      <div className="relative">
                        <div className="absolute inset-0 bg-emerald-500 blur-[80px] opacity-20" />
                        <div className="relative w-48 h-48 bg-white/[0.03] border border-border rounded-full flex flex-col items-center justify-center gap-4 backdrop-blur-3xl shadow-2xl">
                          <CreditCardIcon className="w-20 h-20 text-emerald-400" />
                          <div className="flex gap-1.5 translate-y-2">
                            {[1, 2, 3, 4, 5].map(i => <div key={i} className="w-1 h-1 rounded-full bg-emerald-500" />)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="text-center space-y-4">
                      <h2 className="text-4xl font-black tracking-tight text-white leading-tight">
                        {card.card?.holder_name ?? 'Identity Card'}<br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400">
                          Access Card Verified
                        </span>
                      </h2>
                      <p className="text-white/30 text-xs font-black uppercase tracking-[0.3em]">Institutional Identity Card</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-white/5 rounded-[2rem] overflow-hidden border border-border">
                      {[
                        { label: 'Holder Name', value: card.card?.holder_name ?? '—', icon: <CheckBadgeIcon className="w-5 h-5" /> },
                        { label: 'Role', value: card.card?.holder_type ? (card.card.holder_type.charAt(0).toUpperCase() + card.card.holder_type.slice(1)) : '—', icon: <AcademicCapIcon className="w-5 h-5" /> },
                        { label: 'School', value: card.card?.school_name ?? '—', icon: <ShieldCheckIcon className="w-5 h-5" /> },
                        { label: 'Class', value: card.card?.section_class ?? '—', icon: <DocumentTextIcon className="w-5 h-5" /> },
                        { label: 'Card Number', value: card.card?.card_number ?? '—', icon: <CreditCardIcon className="w-5 h-5" /> },
                        { label: 'Issue Date', value: card.card?.issued_at ? new Date(card.card.issued_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '—', icon: <CalendarIcon className="w-5 h-5" /> },
                        ...(card.card?.expires_at ? [{ label: 'Expiry Date', value: new Date(card.card.expires_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }), icon: <CalendarIcon className="w-5 h-5" /> }] : []),
                        {
                          label: 'Card Status',
                          value: card.result === 'ok' ? 'Active' : card.result === 'revoked' ? 'Revoked' : card.result === 'expired' ? 'Expired' : card.card?.status ?? '—',
                          icon: <ShieldCheckIcon className="w-5 h-5" />,
                        },
                      ].map((item, i) => (
                        <div key={i} className="bg-[#161625] p-6 flex items-start gap-4">
                          <div className="w-10 h-10 bg-white/[0.03] rounded-xl flex items-center justify-center text-white/40">
                            {item.icon}
                          </div>
                          <div className="space-y-1">
                            <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">{item.label}</p>
                            <p className={`text-sm font-bold ${item.label === 'Card Status' ? (card.result === 'ok' ? 'text-emerald-400' : card.result === 'revoked' ? 'text-rose-400' : 'text-amber-400') : 'text-white/80'}`}>{item.value}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Unified hub — a student card links straight to their published results */}
                  {Array.isArray(card.reports) && card.reports.length > 0 && (
                    <div className="bg-card border border-border rounded-[2rem] p-8 space-y-4">
                      <div className="flex items-center gap-2">
                        <AcademicCapIcon className="w-5 h-5 text-violet-400" />
                        <p className="text-sm font-black text-foreground uppercase tracking-widest">Academic Results</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {card.reports.length} published report{card.reports.length !== 1 ? 's' : ''} on record for this student — tap to view &amp; verify.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {card.reports.map((r: any) => (
                          <Link
                            key={r.id}
                            href={`/verify/${r.verification_code}`}
                            className="flex items-center justify-between gap-3 p-4 rounded-xl bg-muted border border-border hover:border-violet-500/40 hover:bg-muted/70 transition-all group"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-foreground truncate">
                                {[r.report_period, r.report_term].filter(Boolean).join(' · ') || 'Report'}
                              </p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {[r.course_name, r.overall_grade].filter(Boolean).join(' · ') || '—'}
                              </p>
                            </div>
                            <span className="text-[10px] font-black text-violet-400 uppercase tracking-widest flex-shrink-0 group-hover:translate-x-0.5 transition-transform">View →</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col md:flex-row items-center justify-center gap-4">
                    <Link
                      href="/verify"
                      className="px-8 py-3.5 bg-violet-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-violet-500 transition-all shadow-lg shadow-violet-900/20 active:scale-95 text-center"
                    >
                      Verify Another
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
                  This verification portal validates Rillcod Technologies credentials. Any attempt to forge, alter, or misrepresent these records is a violation of international academic standards. For legal inquiries or discrepancies, contact <a href="mailto:support@rillcod.com" className="underline hover:text-white transition-colors">support@rillcod.com</a>.
                </p>
              </div>

            </div>
          )}
        </div>
      </main>

      <footer className="mt-auto border-t border-border px-6 py-10 text-center bg-[#0a0a0f]">
        <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest">
          © {new Date().getFullYear()} Rillcod Technologies · Secure Verification Framework v3.0 (Master-Sync)
        </p>
      </footer>
    </div>
  );
}
