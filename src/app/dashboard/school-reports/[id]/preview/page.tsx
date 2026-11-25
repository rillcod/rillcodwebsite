'use client';

import Link from 'next/link';
import { useEffect, useState, use } from 'react';
import { DataQualityDrawer } from '@/components/school-reports/DataQualityDrawer';
import { ReportPreviewChecklist } from '@/components/school-reports/ReportPreviewChecklist';
import { SchoolReportEmailDialog } from '@/components/school-reports/SchoolReportEmailDialog';
import { SchoolReportLivePreview } from '@/components/school-reports/SchoolReportLivePreview';
import { designFromRow } from '@/lib/school-reports/design-state';
import { DEFAULT_SCHOOL_REPORT_DESIGN } from '@/lib/school-reports/design';
import type { SchoolPerformanceReportRow } from '@/lib/school-reports/types';
import { ArrowLeftIcon, DocumentArrowDownIcon } from '@/lib/icons';

export default function SchoolReportPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [report, setReport] = useState<SchoolPerformanceReportRow | null>(null);
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'book' | 'pdf'>('book');
  const [dataQualityOpen, setDataQualityOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`/api/school-performance-reports/${id}`, { cache: 'no-store' });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Unable to load report.');
        if (!cancelled) {
          setReport(json.data as SchoolPerformanceReportRow);
          setRole(json.role || '');
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Unable to load report.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const isSchool = role === 'school';
  const canManage = role === 'admin' || role === 'teacher';

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-6 sm:p-8 mobile-page-root">
        <p className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">Loading preview…</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6 sm:p-8 mobile-page-root">
        <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-600 dark:text-rose-400">
          {error || 'Report not found.'}
        </p>
        <Link href="/dashboard/school-reports" className="text-sm font-black text-primary underline">
          Back to reports
        </Link>
      </div>
    );
  }

  const design = designFromRow(report) ?? DEFAULT_SCHOOL_REPORT_DESIGN;
  const snapshot = report.snapshot;
  const failedSources = (snapshot.dataSources ?? []).filter((row) => row.status === 'failed');

  async function copyShareSummary() {
    if (!report) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.rillcod.com';
    const text = `${report.title} (${report.term_label} · ${report.academic_year})\n${origin}/dashboard/school-reports/${id}/preview`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6 md:p-8 mobile-page-root">
      <header className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <Link
              href={isSchool ? '/dashboard/school-reports' : `/dashboard/school-reports/${id}`}
              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-border bg-background hover:bg-muted text-foreground shrink-0"
              title={isSchool ? 'Back to reports' : 'Back to editor'}
            >
              <ArrowLeftIcon className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-wider text-primary">
                {isSchool ? 'Official Term Report' : 'Report Preview & PDF'}
              </p>
              <h1 className="text-lg sm:text-xl font-black text-foreground truncate">{report.title}</h1>
              <p className="text-xs text-muted-foreground truncate">
                {report.term_label} · {report.academic_year}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex rounded-xl border border-border bg-background p-0.5">
              <button
                type="button"
                onClick={() => setView('book')}
                className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  view === 'book' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Live Book
              </button>
              <button
                type="button"
                onClick={() => setView('pdf')}
                className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                  view === 'pdf' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                PDF Layout
              </button>
            </div>

            <a
              href={`/api/school-performance-reports/${id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs sm:text-sm font-black text-primary-foreground shadow-sm hover:opacity-95"
            >
              <DocumentArrowDownIcon className="h-4 w-4 shrink-0" />
              <span>Download PDF</span>
            </a>

            <button
              type="button"
              onClick={() => void copyShareSummary()}
              className="inline-flex min-h-10 items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-muted"
            >
              {copiedLink ? 'Copied ✓' : 'Copy Link'}
            </button>

            {canManage ? (
              <>
                <button
                  type="button"
                  onClick={() => setEmailOpen(true)}
                  className="inline-flex min-h-10 items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-muted"
                >
                  Email PDF
                </button>
                <button
                  type="button"
                  onClick={() => setDataQualityOpen(true)}
                  className="inline-flex min-h-10 items-center rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-muted"
                >
                  Data Health
                </button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {canManage ? <ReportPreviewChecklist snapshot={snapshot} narrative={report.narrative} /> : null}

      {canManage && failedSources.length ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-950 dark:text-amber-100">
          {failedSources.length} data source{failedSources.length === 1 ? '' : 's'} failed when this snapshot was built.
          Open Data Health before publishing.
        </p>
      ) : null}

      {view === 'book' ? (
        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <SchoolReportLivePreview
            report={report}
            narrative={report.narrative}
            design={design}
            billingHref={snapshot?.finance?.billingHref || '/dashboard/finance'}
            draft={false}
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <iframe
            title="PDF preview"
            src={`/api/school-performance-reports/${id}/pdf`}
            className="h-[80vh] w-full bg-muted/30"
          />
        </div>
      )}

      <DataQualityDrawer
        open={dataQualityOpen}
        onClose={() => setDataQualityOpen(false)}
        sources={snapshot.dataSources}
        generatedAt={snapshot.generatedAt}
        frozen={report.status === 'published'}
        dataNotes={snapshot.dataNotes}
        summary={snapshot.summary}
        schoolProgrammes={snapshot.schoolProgrammes}
        programmeCoursePerformance={snapshot.programmeCoursePerformance}
        finance={snapshot.finance}
      />

      {canManage ? (
        <SchoolReportEmailDialog
          reportId={id}
          reportTitle={report.title}
          open={emailOpen}
          onClose={() => setEmailOpen(false)}
        />
      ) : null}
    </div>
  );
}
