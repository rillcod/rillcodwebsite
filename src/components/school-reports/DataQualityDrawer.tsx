'use client';

import type { DataSourceStatus } from '@/lib/school-reports/source-query';
import { programmeCourseKey } from '@/lib/school-reports/school-curriculum-scope';

const statusTone = (status: DataSourceStatus['status']) => {
  if (status === 'ok') return 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 dark:bg-emerald-500/20';
  if (status === 'empty') return 'text-amber-700 dark:text-amber-300 bg-amber-500/10 dark:bg-amber-500/20';
  if (status === 'partial') return 'text-amber-700 dark:text-amber-300 bg-amber-500/10 dark:bg-amber-500/20';
  return 'text-rose-700 dark:text-rose-300 bg-rose-500/10 dark:bg-rose-500/20';
};

export function DataQualityDrawer({
  open,
  onClose,
  sources,
  generatedAt,
  dataNotes,
  summary,
  schoolProgrammes,
  programmeCoursePerformance,
  finance,
}: {
  open: boolean;
  onClose: () => void;
  sources: DataSourceStatus[] | null | undefined;
  generatedAt?: string | null;
  dataNotes?: string[] | null;
  summary?: {
    activeStudents?: number;
    participantsInClasses?: number;
    unassignedLearners?: number;
    studentsWithScores?: number;
  } | null;
  schoolProgrammes?: Array<{ programme: string; course: string; enrolledStudents: number }> | null;
  programmeCoursePerformance?: Array<{
    programme: string;
    course: string;
    students: number;
    enrolledStudents?: number;
  }> | null;
  finance?: {
    attached?: boolean;
    enrolledStudents?: number;
    billedStudents?: number;
    enrollmentAligned?: boolean;
    billingHref?: string;
    matchDiagnostics?: {
      candidateCount: number;
      hints: string[];
      nearMisses: Array<{ invoiceNumber: string; reasons: string[]; editHref: string }>;
    };
  } | null;
}) {
  if (!open) return null;

  const rows = sources ?? [];
  const failedRequired = rows.filter((row) => row.required && row.status === 'failed');

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Data quality">
      <button type="button" className="absolute inset-0" aria-label="Close data quality panel" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col overflow-hidden rounded-none border-l border-border bg-card shadow-xl sm:rounded-2xl sm:border">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-primary">Data quality</p>
            <h2 className="text-lg font-black">Source health</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-xs font-black">
            Close
          </button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {generatedAt ? (
            <p className="text-xs text-muted-foreground">
              Snapshot checked {new Date(generatedAt).toLocaleString()}
            </p>
          ) : null}
          {failedRequired.length ? (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700">
              {failedRequired.length} required source{failedRequired.length === 1 ? '' : 's'} failed. Fix before publishing.
            </p>
          ) : null}
          {summary ? (
            <div className="rounded-xl border border-border bg-muted/30 p-4 text-xs">
              <p className="font-black">Participant balance</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>Active roster: {summary.activeStudents ?? '—'}</li>
                <li>In classes: {summary.participantsInClasses ?? '—'}</li>
                <li>Unassigned: {summary.unassignedLearners ?? 0}</li>
                <li>With term scores: {summary.studentsWithScores ?? '—'}</li>
              </ul>
            </div>
          ) : null}
          {schoolProgrammes?.length ? (
            <div>
              <p className="text-xs font-black uppercase text-muted-foreground">School programmes</p>
              <ul className="mt-2 space-y-2">
                {schoolProgrammes.map((row) => {
                  const evidenced =
                    programmeCoursePerformance?.find(
                      (pc) => programmeCourseKey(pc.programme, pc.course) === programmeCourseKey(row.programme, row.course),
                    )?.students ?? 0;
                  return (
                    <li key={`${row.programme}-${row.course}`} className="rounded-lg border border-border px-3 py-2 text-xs">
                      <p className="font-black">
                        {row.programme} · {row.course}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        {row.enrolledStudents} enrolled · {evidenced} with scores
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {finance ? (
            <div className="rounded-xl border border-border bg-muted/30 p-4 text-xs">
              <p className="font-black">Finance & enrollment</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>Invoice attached: {finance.attached ? 'Yes' : 'No'}</li>
                {finance.enrolledStudents != null ? <li>Enrolled in classes: {finance.enrolledStudents}</li> : null}
                {finance.billedStudents != null ? <li>Billed on invoice: {finance.billedStudents}</li> : null}
                {finance.enrollmentAligned === false ? (
                  <li className="text-amber-700 dark:text-amber-300">Headcount mismatch — update invoice quantity or class enrollment, then refresh snapshot.</li>
                ) : null}
              </ul>
              {!finance.attached && finance.matchDiagnostics?.nearMisses?.length ? (
                <div className="mt-3 space-y-2">
                  <p className="font-black text-amber-800 dark:text-amber-200">Invoices found but not matched</p>
                  {finance.matchDiagnostics.nearMisses.map((row) => (
                    <div key={row.invoiceNumber} className="rounded-lg border border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/10 p-2">
                      <p className="font-black text-foreground">{row.invoiceNumber}</p>
                      <ul className="mt-1 list-disc pl-4 text-[11px] text-amber-900 dark:text-amber-100">
                        {row.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                      <a href={row.editHref} className="mt-1 inline-block text-[11px] font-black text-primary underline">
                        Open in Finance Center
                      </a>
                    </div>
                  ))}
                </div>
              ) : null}
              {finance.billingHref ? (
                <a href={finance.billingHref} className="mt-3 inline-block text-[11px] font-black text-primary underline">
                  Open Finance Center
                </a>
              ) : null}
            </div>
          ) : null}
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.source} className="rounded-xl border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-black capitalize">{row.source.replace(/_/g, ' ')}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${statusTone(row.status)}`}>
                    {row.status}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.rowCount} rows
                  {row.capped ? ' · capped' : ''}
                  {row.required ? ' · required' : ''}
                </p>
                {row.message ? <p className="mt-2 text-xs text-rose-600">{row.message}</p> : null}
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Checked {new Date(row.checkedAt).toLocaleString()}
                </p>
              </li>
            ))}
            {!rows.length ? (
              <li className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No source ledger on this snapshot. Regenerate data to refresh.
              </li>
            ) : null}
          </ul>
          {dataNotes?.length ? (
            <div>
              <p className="text-xs font-black uppercase text-muted-foreground">Notes</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {dataNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
