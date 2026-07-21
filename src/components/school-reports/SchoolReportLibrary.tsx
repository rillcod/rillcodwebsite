'use client';

import Link from 'next/link';
import { TrashIcon } from '@/lib/icons';
import type { ReportListItem } from '@/lib/school-reports/ui/types';

const LIBRARY_PAGE_SIZE = 12;

export function SchoolReportLibrary({
  reports,
  role,
  canManage,
  loading,
  working,
  onDelete,
  page,
  pageSize,
  totalCount,
  onPageChange,
}: {
  reports: ReportListItem[];
  role: string;
  canManage: boolean;
  loading: boolean;
  working: string;
  onDelete: (report: ReportListItem) => Promise<void>;
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">
            {role === 'school' ? 'Published reports from Rillcod' : 'Saved reports'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {role === 'school'
              ? 'Only reports approved and published for your school appear here.'
              : 'Drafts remain private until a staff member publishes them.'}
          </p>
        </div>
        {canManage ? (
          <Link
            href="/dashboard/school-reports/new"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-black text-white"
          >
            New report book
          </Link>
        ) : null}
      </div>
      {loading ? (
        <p className="rounded-2xl border border-border p-8 text-center text-muted-foreground">Loading reports...</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {reports.map((report) => (
            <div
              key={report.id}
              className="relative rounded-2xl border border-border bg-card transition hover:border-primary/50"
            >
              <Link
                href={
                  role === 'school'
                    ? `/dashboard/school-reports/${report.id}/preview`
                    : `/dashboard/school-reports/${report.id}`
                }
                className="block w-full p-5 text-left"
              >
                <div className="flex items-start justify-between gap-3 pr-16">
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-black uppercase ${
                      report.status === 'published'
                        ? 'bg-emerald-500/10 text-emerald-600'
                        : 'bg-amber-500/10 text-amber-600'
                    }`}
                  >
                    {report.status}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(report.created_at).toLocaleDateString()}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-black">{report.title}</h3>
                <p className="mt-1 text-sm font-bold text-primary">{report.school_name}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  {new Date(report.period_start).toLocaleDateString()} -{' '}
                  {new Date(report.period_end).toLocaleDateString()}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">Prepared by {report.creator_name}</p>
                {report.published_revision_number ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Published revision {report.published_revision_number}
                  </p>
                ) : null}
                {canManage && report.status === 'published' ? (
                  <p className="mt-3 text-[11px] font-bold text-emerald-700">
                    Live for the school · open and unlock to edit
                  </p>
                ) : null}
              </Link>
              {canManage && report.status !== 'published' ? (
                <button
                  type="button"
                  title="Delete draft permanently"
                  disabled={working === 'delete'}
                  onClick={() => void onDelete(report)}
                  className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-black text-rose-700 hover:bg-rose-500/20 disabled:opacity-50"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  Delete
                </button>
              ) : null}
            </div>
          ))}
          {!reports.length ? (
            <p className="col-span-full rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              {canManage ? (
                <>
                  No reports yet.{' '}
                  <Link href="/dashboard/school-reports/new" className="font-black text-primary underline">
                    Create your first report book
                  </Link>
                  .
                </>
              ) : (
                'No reports are available yet.'
              )}
            </p>
          ) : null}
        </div>
      )}
      {!loading && totalCount > pageSize ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Showing {rangeStart}–{rangeEnd} of {totalCount} reports
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-black disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs font-bold text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-black disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
