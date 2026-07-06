'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  AcademicCapIcon,
  ArrowPathIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  DocumentChartBarIcon,
  ExclamationTriangleIcon,
  PrinterIcon,
  ShieldCheckIcon,
} from '@/lib/icons';
import ModernReportCard from '@/components/reports/ModernReportCard';
import type { OrgSettings, ReportCardData } from '@/components/reports/ModernReportCard';
import { generateReportPDF, printElement, ScaledReportCard } from '@/lib/pdf-utils';
import ResultGate from '@/components/verify/ResultGate';

type QuickStudent = {
  id: string;
  full_name: string;
  school_name?: string | null;
  class_name?: string | null;
};

type QuickReport = ReportCardData & {
  id: string;
  label?: string;
  published_at?: string | null;
};

type CardIdentity = {
  holder_name?: string | null;
  holder_type?: string | null;
  school_name?: string | null;
  section_class?: string | null;
  card_number?: string | null;
  issued_at?: string | null;
  expires_at?: string | null;
  status?: string | null;
};

type QuickCheckResponse = {
  accessRequired?: boolean;
  consentPending?: boolean;
  parentCaptured?: boolean;
  consentComplete?: boolean;
  recordGaps?: { needsGender?: boolean; needsAge?: boolean };
  needsGender?: boolean;
  oneTime?: boolean;
  error?: string;
  message?: string;
  student?: QuickStudent;
  reports?: QuickReport[];
  terms?: QuickReport[];
  orgSettings?: OrgSettings | null;
  formUrl?: string | null;
  form?: { title?: string | null } | null;
  // Set when the scanned code is a non-student ID card (teacher/parent/school) — those
  // have no results, so we show an identity panel instead. /result-check is the single
  // home for ID-card + result verification.
  card?: CardIdentity;
  cardResult?: 'ok' | 'revoked' | 'expired' | string;
};

export default function ResultQuickCheckPage() {
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(params?.code || '').trim();
  const displayCode = code.toUpperCase();
  const [data, setData] = useState<QuickCheckResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const reportRef = useRef<HTMLDivElement | null>(null);
  const lastReportActionAt = useRef(0);

  const loadResultCheck = useCallback(async () => {
    if (!code) {
      setData({ error: 'Missing result check code.' });
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/public/student/${encodeURIComponent(code)}/reports?accessCode=${encodeURIComponent(code)}`, {
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || 'Result check failed.');
      }
      setData(json);
      setSelectedReportId(json?.reports?.[0]?.id ?? null);
    } catch (err) {
      try {
        const cres = await fetch(`/api/cards/verify-public?code=${encodeURIComponent(code)}`, { cache: 'no-store' });
        const cjson = await cres.json().catch(() => ({}));
        if (cres.ok && cjson?.card) {
          setData({ card: cjson.card, cardResult: cjson.result });
          return;
        }
      } catch {
        /* fall through */
      }
      setData({ error: err instanceof Error ? err.message : 'Result check failed.' });
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    void loadResultCheck();
  }, [loadResultCheck]);

  const reports = useMemo(() => data?.reports ?? [], [data?.reports]);
  const selectedReport = reports.find((report) => report.id === selectedReportId) ?? reports[0] ?? null;

  function allowReportAction() {
    const now = Date.now();
    if (now - lastReportActionAt.current < 2500) {
      setDownloadError('Please wait a moment before trying again.');
      return false;
    }
    lastReportActionAt.current = now;
    setDownloadError('');
    return true;
  }

  function recordReportAction(action: 'print' | 'download') {
    if (!selectedReport) return;
    fetch(`/api/public/student/${encodeURIComponent(code)}/reports?accessCode=${encodeURIComponent(code)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reportId: selectedReport.id }),
      keepalive: true,
    }).catch(() => {
      // Audit logging is best-effort; parents should not be blocked by it.
    });
  }

  function printReport() {
    if (!reportRef.current || !allowReportAction()) return;
    recordReportAction('print');
    printElement(reportRef.current);
  }

  async function downloadReport() {
    if (!reportRef.current || !selectedReport) return;
    if (!allowReportAction()) return;
    setPdfBusy(true);
    recordReportAction('download');
    try {
      const name = (selectedReport.student_name || data?.student?.full_name || 'Student').replace(/\s+/g, '_');
      const term = (selectedReport.report_term || selectedReport.label || 'Report').replace(/\s+/g, '_');
      await generateReportPDF(reportRef.current, `${name}_${term}.pdf`);
    } catch (err: unknown) {
      setDownloadError(err instanceof Error ? err.message : 'Could not download this report. Please try print/save PDF.');
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 py-10 sm:py-14 space-y-8">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/images/logo.png" alt="Rillcod" width={36} height={36} className="w-9 h-9 object-contain" />
            <div>
              <p className="text-sm font-black tracking-tight">Rillcod Academy</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Result Access Verification</p>
            </div>
          </Link>
          <div className="hidden sm:flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-400">
            <ShieldCheckIcon className="w-4 h-4" />
            Verified by Rillcod Technologies
          </div>
        </header>

        {loading && (
          <div className="rounded-[2rem] border border-border bg-card p-10 text-center space-y-4">
            <ArrowPathIcon className="w-10 h-10 text-primary animate-spin mx-auto" />
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Verifying result access code...</p>
          </div>
        )}

        {!loading && data?.error && !data.student && (
          <div className="rounded-[2rem] border border-rose-500/30 bg-rose-500/10 p-10 text-center space-y-4">
            <ExclamationTriangleIcon className="w-12 h-12 text-rose-400 mx-auto" />
            <h1 className="text-2xl font-black">Result Access Not Verified</h1>
            <p className="text-sm text-muted-foreground">{data.error}</p>
            <Link
              href="/result-check"
              className="inline-flex items-center justify-center px-5 py-3 rounded-2xl bg-background border border-border text-xs font-black uppercase tracking-widest text-foreground hover:bg-muted transition-colors"
            >
              Try Another Code
            </Link>
          </div>
        )}

        {!loading && data?.card && !data.student && (
          <section className="rounded-[2rem] border border-border bg-card p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <ShieldCheckIcon className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {data.card.holder_type ? `${data.card.holder_type.charAt(0).toUpperCase()}${data.card.holder_type.slice(1)} ID Card` : 'Identity Card'}
                  </p>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{data.card.holder_name || 'Card Holder'}</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    {[data.card.school_name, data.card.section_class].filter(Boolean).join(' · ') || 'Rillcod Technologies'}
                  </p>
                </div>
              </div>
              <div className="px-3 py-2 rounded-xl bg-muted text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Code: {displayCode}
              </div>
            </div>

            <div className={`rounded-[1.5rem] border p-5 flex items-start gap-3 ${
              data.cardResult === 'ok'
                ? 'border-emerald-500/20 bg-emerald-500/10'
                : 'border-rose-500/20 bg-rose-500/10'
            }`}>
              {data.cardResult === 'ok'
                ? <CheckCircleIcon className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                : <ExclamationTriangleIcon className="w-6 h-6 text-rose-400 flex-shrink-0" />}
              <div>
                <p className="text-sm font-black text-foreground">
                  {data.cardResult === 'ok' ? 'Valid Access Card' : data.cardResult === 'revoked' ? 'Card Revoked' : data.cardResult === 'expired' ? 'Card Expired' : 'Card Status Unknown'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Verified against the Rillcod Technologies card ledger.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label: 'Card Number', value: data.card.card_number || '—' },
                { label: 'Role', value: data.card.holder_type ? `${data.card.holder_type.charAt(0).toUpperCase()}${data.card.holder_type.slice(1)}` : '—' },
                { label: 'Issue Date', value: data.card.issued_at ? new Date(data.card.issued_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '—' },
                { label: 'Expiry Date', value: data.card.expires_at ? new Date(data.card.expires_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '—' },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-border bg-background p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-bold text-foreground mt-1">{item.value}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {!loading && data?.student && (
          <section className="rounded-[2rem] border border-border bg-card p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <AcademicCapIcon className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Student</p>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{data.student.full_name}</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    {[data.student.school_name, data.student.class_name].filter(Boolean).join(' · ') || 'Rillcod learner'}
                  </p>
                </div>
              </div>
              <div className="px-3 py-2 rounded-xl bg-muted text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Code: {displayCode}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-emerald-500/20 bg-emerald-500/10 p-5 flex items-start gap-3">
              <CheckCircleIcon className="w-6 h-6 text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-black text-foreground">Verified by Rillcod Technologies</p>
                <p className="text-xs text-muted-foreground mt-1">This is a genuine Rillcod result access code.</p>
              </div>
            </div>

            {data.consentPending && data.formUrl && (
              <div className="rounded-[1.5rem] border border-border bg-muted/30 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Your school has an optional form you can complete — not required to view results.
                </p>
                <a
                  href={data.formUrl}
                  className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline whitespace-nowrap"
                >
                  Open {data.form?.title || 'school form'} →
                </a>
              </div>
            )}

            <div className="space-y-5">
              <ResultGate
                code={code}
                captured={!!data.parentCaptured}
                recordGaps={data.recordGaps ?? { needsGender: !!data.needsGender }}
                onClaimLinked={() => void loadResultCheck()}
              >
                {reports.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-border bg-background p-8 text-center">
                    <DocumentChartBarIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm font-black uppercase tracking-widest">No Published Result Yet</p>
                    <p className="text-xs text-muted-foreground mt-2">The result will appear here once the school publishes it.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 rounded-[1.5rem] border border-border bg-background p-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Official Report Card</p>
                        <p className="text-sm font-bold text-foreground mt-1">
                          {selectedReport?.course_name || selectedReport?.label || 'Published Progress Report'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {reports.length > 1 && (
                          <select
                            value={selectedReport?.id || ''}
                            onChange={(event) => setSelectedReportId(event.target.value)}
                            className="px-3 py-2 rounded-xl border border-border bg-card text-xs font-bold text-foreground outline-none"
                            aria-label="Select report term"
                          >
                            {reports.map((report) => (
                              <option key={report.id} value={report.id}>
                                {report.label || [report.report_period, report.report_term].filter(Boolean).join(' · ') || report.course_name || 'Published Report'}
                              </option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          onClick={printReport}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card text-xs font-black uppercase tracking-widest text-foreground hover:bg-muted"
                        >
                          <PrinterIcon className="w-4 h-4" />
                          Print
                        </button>
                        <button
                          type="button"
                          onClick={downloadReport}
                          disabled={pdfBusy}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50"
                        >
                          {pdfBusy ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <ArrowDownTrayIcon className="w-4 h-4" />}
                          Download
                        </button>
                      </div>
                    </div>

                    {downloadError && (
                      <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-bold text-rose-300">
                        {downloadError}
                      </div>
                    )}

                    {selectedReport && (
                      <div className="overflow-auto rounded-[1.5rem] border border-border bg-white p-3 sm:p-5">
                        <div ref={reportRef} className="relative mx-auto bg-white" style={{ width: '210mm', minHeight: '297mm' }}>
                          <div className="absolute right-5 top-5 z-20 rounded-full border border-emerald-200 bg-white/95 px-4 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-emerald-700 shadow-sm">
                            Verified by Rillcod Technologies
                          </div>
                          <ScaledReportCard report={selectedReport} responsive>
                            <ModernReportCard report={selectedReport} orgSettings={data?.orgSettings ?? null} />
                          </ScaledReportCard>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </ResultGate>
            </div>
            <div className="pt-2 border-t border-border">
              <Link href="/result-check" className="text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground">
                Check another result code
              </Link>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
