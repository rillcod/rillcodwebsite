'use client';

import Link from 'next/link';
import { use } from 'react';
import { SchoolReportAnalyticsPanel } from '@/components/school-reports/SchoolReportAnalyticsPanel';
import { CrossTermComparisonPanel } from '@/components/school-reports/CrossTermComparisonPanel';
import { useSchoolReportEditorPage } from '@/hooks/useSchoolReportEditorPage';

export default function SchoolReportAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const editor = useSchoolReportEditorPage(id);

  if (editor.loading) {
    return (
      <div className="mx-auto max-w-7xl p-8">
        <p className="rounded-2xl border border-border p-8 text-center text-muted-foreground">Loading analytics…</p>
      </div>
    );
  }

  if (!editor.report) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-8">
        <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-600 dark:text-rose-400">
          {editor.error || 'Report not found.'}
        </p>
        <Link href="/dashboard/school-reports" className="text-sm font-black text-primary underline">
          Back to reports
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7 p-4 md:p-8">
      <header>
        <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Report insights</p>
        <h1 className="mt-2 text-2xl font-black">{editor.report.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Charts, learner roster, and data source freshness for staff review.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Link href={`/dashboard/school-reports/${id}`} className="rounded-xl border border-border px-4 py-2 text-sm font-black">
          Back to report
        </Link>
        <Link
          href={`/dashboard/school-reports/${id}/preview`}
          className="rounded-xl border border-border px-4 py-2 text-sm font-black"
        >
          Open output
        </Link>
      </div>

      <CrossTermComparisonPanel reportId={id} />

      <SchoolReportAnalyticsPanel report={editor.report} role={editor.role} />
    </div>
  );
}
