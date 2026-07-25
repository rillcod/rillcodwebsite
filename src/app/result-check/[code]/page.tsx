'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  AcademicCapIcon,
  ArrowPathIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PrinterIcon,
  ShieldCheckIcon,
} from '@/lib/icons';
import ModernReportCard from '@/components/reports/ModernReportCard';
import type { OrgSettings, ReportCardData } from '@/components/reports/ModernReportCard';
import { generateReportPDF, printElement, ScaledReportCard } from '@/lib/pdf-utils';
import ResultGate from '@/components/verify/ResultGate';
import ResultCheckShell from '@/components/result-check/ResultCheckShell';
import type { ParentClaimLinkedResult } from '@/lib/parent-claim/linked-result';
import { formatAccessCardCodeDisplay, normalizeAccessCardCode } from '@/lib/access-card-code';

type QuickStudent = {
  id: string;
  full_name: string;
  first_name?: string | null;
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
  codeAccepted?: boolean;
  reportPending?: boolean;
  needsParentSetup?: boolean;
  pendingMessage?: string;
  consentPending?: boolean;
  parentCaptured?: boolean;
  sessionAutoLinked?: boolean;
  staffBypass?: boolean;
  staffRole?: string | null;
  staffName?: string | null;
  portalAccess?: {
    parentLoginUrl: string;
    studentLoginUrl?: string | null;
    parentEmail?: string;
    studentEmail?: string | null;
  } | null;
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
  card?: CardIdentity;
  cardResult?: 'ok' | 'revoked' | 'expired' | string;
};

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rc-fade-up rc-panel rounded-[1.75rem] p-5 sm:p-7 ${className}`}>
      {children}
    </section>
  );
}

export default function ResultQuickCheckPage() {
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(params?.code || '').trim();
  const displayCode = formatAccessCardCodeDisplay(code) || normalizeAccessCardCode(code) || code.toUpperCase();
  const [data, setData] = useState<QuickCheckResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [justLinked, setJustLinked] = useState(false);
  const [reportRefreshFailed, setReportRefreshFailed] = useState(false);
  const [claimPortalAccess, setClaimPortalAccess] = useState<QuickCheckResponse['portalAccess']>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const reportRef = useRef<HTMLDivElement | null>(null);
  const lastReportActionAt = useRef(0);

  const loadResultCheck = useCallback(async (opts?: { soft?: boolean; afterLink?: boolean; attempt?: number }) => {
    if (!code) {
      setData({ error: 'Missing result check code.' });
      setLoading(false);
      return;
    }

    if (opts?.soft) setRefreshing(true);
    else setLoading(true);
    if (opts?.soft) setReportRefreshFailed(false);

    let keepRefreshing = false;
    try {
      const res = await fetch(`/api/public/student/${encodeURIComponent(code)}/reports?accessCode=${encodeURIComponent(code)}`, {
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || 'Result check failed.');
      }

      // After OTP/link, DB write is synchronous but retry briefly if capture hasn't propagated yet.
      if (opts?.afterLink && !json?.parentCaptured) {
        const attempt = opts.attempt ?? 0;
        if (attempt < 4) {
          keepRefreshing = true;
          await new Promise((resolve) => setTimeout(resolve, 250 + attempt * 200));
          await loadResultCheck({ soft: true, afterLink: true, attempt: attempt + 1 });
          return;
        }
        setReportRefreshFailed(true);
      }

      setData(json);
      setSelectedReportId(json?.reports?.[0]?.id ?? null);
      if (json?.parentCaptured) setJustLinked(false);
    } catch (err) {
      if (opts?.soft) {
        setReportRefreshFailed(true);
        return;
      }
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
      if (opts?.soft) {
        if (!keepRefreshing) setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [code]);

  function handleClaimLinked(result: ParentClaimLinkedResult) {
    setJustLinked(true);
    setReportRefreshFailed(false);
    const creds = result.credentials;
    if (creds?.parentLoginUrl || creds?.parentEmail) {
      setClaimPortalAccess({
        parentLoginUrl: creds.parentLoginUrl ?? `/login?type=parent&email=${encodeURIComponent(creds.parentEmail ?? '')}`,
        studentLoginUrl: creds.studentLoginUrl ?? null,
        parentEmail: creds.parentEmail,
        studentEmail: creds.studentEmail,
      });
    }
    void loadResultCheck({ soft: true, afterLink: true });
  }

  useEffect(() => {
    void loadResultCheck();
  }, [loadResultCheck]);

  const reports = useMemo(() => data?.reports ?? [], [data?.reports]);
  const parentVerified = !!(data?.parentCaptured || data?.sessionAutoLinked || justLinked);
  const activePortalAccess = data?.portalAccess ?? claimPortalAccess;

  useEffect(() => {
    if (!justLinked || reports.length === 0) return;
    const t = setTimeout(() => {
      reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
    return () => clearTimeout(t);
  }, [justLinked, reports.length]);
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
    }).catch(() => {});
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
    <ResultCheckShell compact>
      {loading && (
        <Panel className="space-y-4 text-center">
          <ArrowPathIcon className="mx-auto h-10 w-10 animate-spin text-primary" />
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Verifying access code…
          </p>
        </Panel>
      )}

      {!loading && data?.error && !data.student && (
        <Panel className="space-y-5 border-rose-500/30 bg-rose-500/10 text-center">
          <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-rose-500" />
          <div>
            <h1 className="rc-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Result access not verified
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{data.error}</p>
          </div>
          <Link
            href="/result-check"
            className="rc-cta inline-flex items-center justify-center rounded-2xl px-6 py-3.5 text-sm font-bold tracking-wide"
          >
            Try another code
          </Link>
        </Panel>
      )}

      {!loading && data?.card && !data.student && (
        <Panel className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
                <ShieldCheckIcon className="h-7 w-7 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {data.card.holder_type
                    ? `${data.card.holder_type.charAt(0).toUpperCase()}${data.card.holder_type.slice(1)} ID Card`
                    : 'Identity Card'}
                </p>
                <h1 className="rc-display text-2xl font-bold tracking-tight sm:text-3xl">
                  {data.card.holder_name || 'Card Holder'}
                </h1>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {[data.card.school_name, data.card.section_class].filter(Boolean).join(' · ') || 'Rillcod Technologies'}
                </p>
              </div>
            </div>
            <div className="w-fit rounded-full bg-card/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground ring-1 ring-border">
              {displayCode}
            </div>
          </div>

          <div
            className={`flex items-start gap-3 rounded-[1.25rem] border p-4 sm:p-5 ${
              data.cardResult === 'ok'
                ? 'border-emerald-500/25 bg-emerald-500/10'
                : 'border-rose-500/25 bg-rose-500/10'
            }`}
          >
            {data.cardResult === 'ok' ? (
              <CheckCircleIcon className="h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <ExclamationTriangleIcon className="h-6 w-6 shrink-0 text-rose-500" />
            )}
            <div>
              <p className="text-sm font-bold">
                {data.cardResult === 'ok'
                  ? 'Valid access card'
                  : data.cardResult === 'revoked'
                    ? 'Card revoked'
                    : data.cardResult === 'expired'
                      ? 'Card expired'
                      : 'Card status unknown'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Verified against the Rillcod Technologies card ledger.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              { label: 'Card Number', value: data.card.card_number || '—' },
              {
                label: 'Role',
                value: data.card.holder_type
                  ? `${data.card.holder_type.charAt(0).toUpperCase()}${data.card.holder_type.slice(1)}`
                  : '—',
              },
              {
                label: 'Issue Date',
                value: data.card.issued_at
                  ? new Date(data.card.issued_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
                  : '—',
              },
              {
                label: 'Expiry Date',
                value: data.card.expires_at
                  ? new Date(data.card.expires_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
                  : '—',
              },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-border bg-card/70 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-sm font-semibold">{item.value}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {!loading && data?.reportPending && (
        <Panel className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-sky-500/10 ring-1 ring-sky-500/20">
                <AcademicCapIcon className="h-7 w-7 text-sky-600 dark:text-sky-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Report coming soon</p>
                <h1 className="rc-display text-2xl font-bold tracking-tight sm:text-3xl">
                  {data.student?.full_name || data.student?.first_name || 'Student number accepted'}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {[data.student?.school_name, data.student?.class_name].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
            <div className="w-fit rounded-full bg-card/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground ring-1 ring-border">
              {displayCode}
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-[1.25rem] border border-sky-500/25 bg-sky-500/10 p-4 sm:p-5">
            <ShieldCheckIcon className="h-6 w-6 shrink-0 text-sky-600 dark:text-sky-400" />
            <div>
              <p className="text-sm font-bold">Great work — report on the way!</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {data.pendingMessage || 'Your coding report is being prepared. Check back here soon — it will appear automatically once published.'}
              </p>
            </div>
          </div>

          {!data.parentCaptured && data.needsParentSetup && (
            <ResultGate
              code={code}
              captured={parentVerified}
              recordGaps={data.recordGaps ?? { needsGender: !!data.needsGender }}
              onClaimLinked={handleClaimLinked}
            >
              <div className="rounded-[1.25rem] border border-emerald-500/25 bg-emerald-500/10 p-4 text-center text-xs text-muted-foreground">
                Parent account saved — we will notify you when the report is ready.
              </div>
            </ResultGate>
          )}

          {data.parentCaptured && (
            <div className="rounded-[1.25rem] border border-emerald-500/25 bg-emerald-500/10 p-4 text-center">
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Parent account linked</p>
              <p className="mt-1 text-xs text-muted-foreground">When the report is published, return here with the same student number — it will open instantly.</p>
              <Link
                href={`/parent-claim?code=${encodeURIComponent(code)}`}
                className="mt-2 inline-flex text-xs font-bold text-emerald-600 dark:text-emerald-400 underline underline-offset-2"
              >
                Update Parent Details Form ↗
              </Link>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <Link href="/result-check" className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground">
              ← Check another student number
            </Link>
            <Link
              href={`/parent-claim?code=${encodeURIComponent(code)}`}
              className="text-xs font-bold text-primary hover:underline"
            >
              Fill Parent Details Form (Parent Claim) ↗
            </Link>
          </div>
        </Panel>
      )}

      {!loading && data?.student && !data.reportPending && (
        <Panel className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
                <AcademicCapIcon className="h-7 w-7 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {data.parentCaptured ? 'Student' : 'Result check'}
                </p>
                <h1 className="rc-display text-2xl font-bold tracking-tight sm:text-3xl">
                  {data.student.full_name || 'Published result found'}
                </h1>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {data.parentCaptured
                    ? ([data.student.school_name, data.student.class_name].filter(Boolean).join(' · ') || 'Rillcod learner')
                    : 'One-time parent setup below unlocks the report'}
                </p>
              </div>
            </div>
            <div className="w-fit rounded-full bg-card/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground ring-1 ring-border">
              {displayCode}
            </div>
          </div>

          {(parentVerified) && (
            <div className="flex items-start gap-3 rounded-[1.25rem] border border-emerald-500/25 bg-emerald-500/10 p-4 sm:p-5">
              <CheckCircleIcon className="h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="text-sm font-bold">Verified by Rillcod Technologies</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {justLinked
                    ? 'Parent account linked — your report is below.'
                    : data.sessionAutoLinked
                      ? 'Welcome back — your account is linked.'
                      : 'Parent account confirmed — report unlocked.'}
                </p>
              </div>
            </div>
          )}


          {data.consentPending && data.formUrl && (
            <div className="flex flex-col gap-3 rounded-[1.25rem] border border-border bg-card/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Your school has an optional form you can complete — not required to view results.
              </p>
              <a
                href={data.formUrl}
                className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.16em] text-primary hover:underline"
              >
                Open {data.form?.title || 'school form'} →
              </a>
            </div>
          )}

          <div className="space-y-5">
            <ResultGate
              code={code}
              captured={parentVerified}
              sessionAutoLinked={!!data.sessionAutoLinked}
              recordGaps={data.recordGaps ?? { needsGender: !!data.needsGender }}
              portalAccess={activePortalAccess ?? null}
              staffRole={data.staffRole ?? null}
              staffName={data.staffName ?? null}
              onClaimLinked={handleClaimLinked}
            >
              {(justLinked || refreshing) && reports.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-[1.25rem] border border-border bg-card/70 p-8 text-center">
                  {reportRefreshFailed ? (
                    <>
                      <ExclamationTriangleIcon className="h-8 w-8 text-amber-500" />
                      <p className="text-sm font-bold text-foreground">Could not load the report yet</p>
                      <p className="text-xs text-muted-foreground">Your account is linked — tap below. No need to re-enter the student number.</p>
                      <button
                        type="button"
                        onClick={() => void loadResultCheck({ soft: true })}
                        className="rc-cta rounded-xl px-5 py-2.5 text-xs font-bold uppercase tracking-[0.14em]"
                      >
                        Show my report
                      </button>
                    </>
                  ) : (
                    <>
                      <ArrowPathIcon className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm font-bold text-foreground">Opening your report…</p>
                      <p className="text-xs text-muted-foreground">One moment — no need to re-enter the student number.</p>
                    </>
                  )}
                </div>
              ) : reports.length > 0 ? (
                <>
                  <div className="flex flex-col gap-3 rounded-[1.25rem] border border-border bg-card/70 p-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Official report card</p>
                      <p className="mt-1 truncate text-sm font-semibold">
                        {selectedReport?.course_name || selectedReport?.label || 'Published Progress Report'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {reports.length > 1 && (
                        <select
                          value={selectedReport?.id || ''}
                          onChange={(event) => setSelectedReportId(event.target.value)}
                          className="rounded-xl border border-border bg-card px-3 py-2.5 text-xs font-semibold outline-none focus:border-primary"
                          aria-label="Select report term"
                        >
                          {reports.map((report) => (
                            <option key={report.id} value={report.id}>
                              {report.label ||
                                [report.report_period, report.report_term].filter(Boolean).join(' · ') ||
                                report.course_name ||
                                'Published Report'}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={printReport}
                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] transition hover:bg-muted"
                      >
                        <PrinterIcon className="h-4 w-4" />
                        Print
                      </button>
                      <button
                        type="button"
                        onClick={downloadReport}
                        disabled={pdfBusy}
                        className="rc-cta inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-[0.14em] disabled:opacity-50"
                      >
                        {pdfBusy ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ArrowDownTrayIcon className="h-4 w-4" />}
                        Download
                      </button>
                    </div>
                  </div>

                  {downloadError && (
                    <div role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-semibold text-rose-600 dark:text-rose-300">
                      {downloadError}
                    </div>
                  )}

                  {selectedReport && (
                    <div className="relative overflow-hidden rounded-[1.25rem] border border-border bg-card p-2 sm:p-5">
                      <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-full border border-emerald-500/30 bg-card/95 px-3 py-1.5 text-[8px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400 shadow-sm print:hidden sm:right-7 sm:top-7 sm:px-4 sm:py-2 sm:text-[9px]">
                        Verified by Rillcod Technologies
                      </div>
                      <div ref={reportRef} className="mx-auto w-full bg-white" style={{ maxWidth: '210mm' }}>
                        <ScaledReportCard report={selectedReport} responsive>
                          <ModernReportCard report={selectedReport} orgSettings={data?.orgSettings ?? null} />
                        </ScaledReportCard>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </ResultGate>
          </div>

          <div className="border-t border-border pt-4">
            <Link
              href="/result-check"
              className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground transition hover:text-foreground"
            >
              Check another result code
            </Link>
          </div>
        </Panel>
      )}
    </ResultCheckShell>
  );
}
