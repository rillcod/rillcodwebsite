'use client';

import Link from 'next/link';
import { useEffect, useState, use } from 'react';
import { SchoolReportLivePreview } from '@/components/school-reports/SchoolReportLivePreview';
import { SchoolReportWorkflowRail } from '@/components/school-reports/SchoolReportWorkflowRail';
import { designFromRow } from '@/lib/school-reports/design-state';
import { DEFAULT_SCHOOL_REPORT_DESIGN } from '@/lib/school-reports/design';
import type { SchoolPerformanceReportRow } from '@/lib/school-reports/types';

export default function SchoolReportPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [report, setReport] = useState<SchoolPerformanceReportRow | null>(null);
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-8">
        <p className="rounded-2xl border border-border p-8 text-center text-muted-foreground">Loading preview…</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-8">
        <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-600">
          {error || 'Report not found.'}
        </p>
        <Link href="/dashboard/school-reports" className="text-sm font-black text-primary underline">
          Back to reports
        </Link>
      </div>
    );
  }

  const design = designFromRow(report) ?? DEFAULT_SCHOOL_REPORT_DESIGN;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      {role !== 'school' ? (
        <SchoolReportWorkflowRail
          reportId={id}
          activeStep="preview"
          published={report.status === 'published'}
          canManage={role === 'admin' || role === 'teacher'}
        />
      ) : null}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Full preview</p>
          <h1 className="mt-2 text-2xl font-black">{report.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Saved book layout — open the editor to change wording or design.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isSchool ? (
            <Link
              href={`/dashboard/school-reports/${id}`}
              className="rounded-xl border border-border px-4 py-2 text-sm font-black"
            >
              Open editor
            </Link>
          ) : null}
          <a
            href={`/api/school-performance-reports/${id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-black text-white"
          >
            Download PDF
          </a>
        </div>
      </header>

      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <SchoolReportLivePreview
          report={report}
          narrative={report.narrative}
          design={design}
          billingHref={report.snapshot?.finance?.billingHref || '/dashboard/finance'}
          draft={false}
        />
      </div>
    </div>
  );
}
