"use client";

import Link from "next/link";
import { ArrowRightIcon, TrashIcon } from "@/lib/icons";
import type { ReportListItem } from "@/lib/school-reports/ui/types";
import { isDraftSnapshotStale } from "@/lib/school-reports/source-query";

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
  hasMore = false,
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
  hasMore?: boolean;
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
            {role === "school"
              ? "Published reports from Rillcod"
              : "Saved reports"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {role === "school"
              ? "Only reports approved and published for your school appear here."
              : "Drafts remain private until a staff member publishes them."}
          </p>
        </div>
        {canManage ? (
          <Link
            href="/dashboard/school-reports/new"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground shadow-sm hover:bg-primary/90 transition-all"
          >
            New report book
          </Link>
        ) : null}
      </div>
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading reports">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-52 animate-pulse rounded-3xl border border-border bg-card p-5">
              <div className="h-5 w-24 rounded-full bg-muted" />
              <div className="mt-8 h-5 w-3/4 rounded bg-muted" />
              <div className="mt-3 h-4 w-1/2 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {reports.map((report) => (
            <div
              key={report.id}
              className="group relative overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
            >
              <Link
                href={
                  role === "school"
                    ? `/dashboard/school-reports/${report.id}/preview`
                    : `/dashboard/school-reports/${report.id}`
                }
                className="block w-full p-5 text-left"
              >
                <div className="flex items-start justify-between gap-3 pr-16">
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-black uppercase ${
                      report.status === "published"
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 dark:bg-emerald-500/20 border border-emerald-500/25"
                        : "bg-amber-500/10 text-amber-700 dark:text-amber-300 dark:bg-amber-500/20 border border-amber-500/25"
                    }`}
                  >
                    {report.status}
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">
                    Updated{" "}
                    {new Date(
                      report.updated_at || report.created_at
                    ).toLocaleDateString()}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-black text-foreground">
                  {report.title}
                </h3>
                <p className="mt-1 text-sm font-bold text-primary">
                  {report.school_name}
                </p>
                <p className="mt-3 text-xs text-muted-foreground font-medium">
                  {new Date(report.period_start).toLocaleDateString()} -{" "}
                  {new Date(report.period_end).toLocaleDateString()}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Prepared by {report.creator_name}
                </p>
                {report.working_revision_number ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Working revision {report.working_revision_number}
                    {report.published_revision_number
                      ? ` · Published revision ${report.published_revision_number}`
                      : ""}
                  </p>
                ) : report.published_revision_number ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Published revision {report.published_revision_number}
                  </p>
                ) : null}
                {canManage && report.status !== "published" && isDraftSnapshotStale(report.updated_at) ? (
                  <p className="mt-3 text-[11px] font-bold text-amber-800 dark:text-amber-200">
                    Draft may be stale — open and refresh data before publishing.
                  </p>
                ) : null}
                {canManage && report.status === "published" ? (
                  <p className="mt-3 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                    Live for the school · open and unlock to edit
                  </p>
                ) : null}
                <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-black text-primary">
                  {role === "school" ? "Open published book" : "Review report book"}
                  <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
              {canManage && report.status !== "published" ? (
                <button
                  type="button"
                  title="Delete draft permanently"
                  disabled={working === "delete"}
                  onClick={() => void onDelete(report)}
                  className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-black text-rose-700 dark:text-rose-300 dark:bg-rose-500/20 hover:bg-rose-500/20 disabled:opacity-50 transition-colors"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  Delete
                </button>
              ) : null}
            </div>
          ))}
          {!reports.length ? (
            <p className="col-span-full rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
              {canManage ? (
                <>
                  No reports yet.{" "}
                  <Link
                    href="/dashboard/school-reports/new"
                    className="font-black text-primary hover:underline"
                  >
                    Create your first report book
                  </Link>
                  .
                </>
              ) : (
                "No reports are available yet."
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
              disabled={page >= totalPages && !hasMore}
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
