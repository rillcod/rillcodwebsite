"use client";

import Link from "next/link";
import { ArrowRightIcon, DocumentArrowDownIcon, TrashIcon } from "@/lib/icons";
import type { ReportListItem } from "@/lib/school-reports/ui/types";
import { isDraftSnapshotStale } from "@/lib/school-reports/source-query";

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
    <section className="space-y-4">
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading reports">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-48 animate-pulse rounded-2xl border border-border bg-card p-5">
              <div className="h-5 w-24 rounded-full bg-muted" />
              <div className="mt-6 h-5 w-3/4 rounded bg-muted" />
              <div className="mt-3 h-4 w-1/2 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {reports.map((report) => {
            const primaryHref =
              role === "school"
                ? `/dashboard/school-reports/${report.id}/preview`
                : `/dashboard/school-reports/${report.id}`;

            return (
              <article
                key={report.id}
                className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase ${
                        report.status === "published"
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25"
                          : report.status === "draft"
                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/25"
                            : "bg-muted text-muted-foreground border border-border"
                      }`}
                    >
                      {report.status === "published"
                        ? "Published"
                        : report.status === "draft"
                          ? "Draft"
                          : "Archived"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(report.updated_at || report.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <Link href={primaryHref} className="block mt-3 group-hover:text-primary transition-colors">
                    <h2 className="text-base sm:text-lg font-black text-foreground leading-snug line-clamp-2">
                      {report.title}
                    </h2>
                  </Link>
                  <p className="mt-1 text-xs sm:text-sm font-bold text-primary truncate">
                    {report.school_name}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-muted-foreground">
                    {report.term_label} · {report.academic_year}
                  </p>

                  {canManage && report.status !== "published" && isDraftSnapshotStale(report.updated_at) ? (
                    <p className="mt-2.5 rounded-lg bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                      Snapshot older than recent rolls — refresh before publishing.
                    </p>
                  ) : null}
                </div>

                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-2">
                  <Link
                    href={primaryHref}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 text-xs font-black text-primary hover:bg-primary/20 transition-colors"
                  >
                    <span>{role === "school" ? "Open Book" : report.status === "published" ? "View / Manage" : "Edit Draft"}</span>
                    <ArrowRightIcon className="h-3.5 w-3.5" />
                  </Link>

                  <div className="flex items-center gap-1.5">
                    <a
                      href={`/api/school-performance-reports/${report.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-muted transition-colors"
                      title="Download PDF"
                    >
                      <DocumentArrowDownIcon className="h-3.5 w-3.5 shrink-0" />
                      <span>PDF</span>
                    </a>
                    {canManage && report.status !== "published" ? (
                      <button
                        type="button"
                        title="Delete draft permanently"
                        aria-label={`Delete ${report.title}`}
                        disabled={working === "delete"}
                        onClick={() => void onDelete(report)}
                        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 p-2 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 disabled:opacity-50 transition-colors"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}

          {!reports.length ? (
            <div className="col-span-full rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
              {canManage ? (
                <>
                  No report books match this view.{" "}
                  <Link
                    href="/dashboard/school-reports/new"
                    className="font-black text-primary hover:underline"
                  >
                    Create a new report book
                  </Link>
                  .
                </>
              ) : (
                "No published school report books are available yet."
              )}
            </div>
          ) : null}
        </div>
      )}

      {!loading && totalCount > pageSize ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Showing {rangeStart}–{rangeEnd} of {totalCount} reports
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="min-h-10 rounded-xl border border-border px-3 py-1.5 text-xs font-black disabled:opacity-40 hover:bg-muted"
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
              className="min-h-10 rounded-xl border border-border px-3 py-1.5 text-xs font-black disabled:opacity-40 hover:bg-muted"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
