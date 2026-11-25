"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SchoolReportLibrary } from "@/components/school-reports/SchoolReportLibrary";
import {
  AcademicCapIcon,
  BuildingOffice2Icon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@/lib/icons";
import type {
  AcademicTerm,
  ReportListItem,
} from "@/lib/school-reports/ui/types";

type StatusFilter = "all" | "draft" | "published" | "archived";
const LIBRARY_PAGE_SIZE = 12;

export default function SchoolReportsLibraryPage() {
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [termFilter, setTermFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const canManage = role === "admin" || role === "teacher";
  const isSchool = role === "school";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIBRARY_PAGE_SIZE),
        status: statusFilter,
      });
      if (search.trim()) params.set("search", search.trim());
      if (termFilter) params.set("academicTermId", termFilter);
      const response = await fetch(
        `/api/school-performance-reports?${params.toString()}`,
        { cache: "no-store" }
      );
      const json = await response.json();
      if (!response.ok)
        throw new Error(json.error || "Unable to load reports.");
      setReports(json.data || []);
      setTerms(json.terms || []);
      setRole(json.role || "");
      setTotalCount(json.meta?.total ?? json.data?.length ?? 0);
      setHasMore(Boolean(json.meta?.hasMore));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load reports."
      );
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, termFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, termFilter]);

  async function deleteReportById(report: ReportListItem) {
    if (report.status === "published") {
      setError(
        "Withdraw this published report first, then you can delete the draft."
      );
      return;
    }
    if (
      !window.confirm(
        `Delete "${report.title}" permanently? This removes the draft book for ${report.school_name} and cannot be undone.`
      )
    ) {
      return;
    }
    setWorking("delete");
    setError("");
    try {
      const response = await fetch(
        `/api/school-performance-reports/${report.id}`,
        { method: "DELETE" }
      );
      const json = await response.json();
      if (!response.ok)
        throw new Error(json.error || "Unable to delete report.");
      await load();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete report."
      );
    } finally {
      setWorking("");
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8 mobile-page-root">
      {/* Unified Header + Action Bar */}
      <header className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-primary">
                <AcademicCapIcon className="h-3.5 w-3.5" />
                {isSchool ? "School Report Books" : "Academic Office · School Reports"}
              </span>
              {totalCount > 0 && <span>{totalCount} total</span>}
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
              {isSchool
                ? "Official Term Performance Books"
                : "School Performance Reports"}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl">
              {isSchool
                ? "Verified term books combining learner results, attendance, curriculum delivery, and programme standing."
                : "Build, review, and publish verified term report books for partner schools."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {canManage ? (
              <>
                <Link
                  href="/dashboard/school-reports/new"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs sm:text-sm font-black text-primary-foreground shadow-sm hover:opacity-95 transition-opacity"
                >
                  <PlusIcon className="h-4 w-4 shrink-0" />
                  <span>New Report Book</span>
                </Link>
                <Link
                  href="/dashboard/results"
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-foreground hover:bg-muted/60 transition-colors"
                >
                  <DocumentTextIcon className="h-4 w-4 shrink-0" />
                  <span>Student Results</span>
                </Link>
              </>
            ) : (
              <Link
                href="/dashboard/school-overview"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-foreground hover:bg-muted/60 transition-colors"
              >
                <BuildingOffice2Icon className="h-4 w-4 shrink-0 text-primary" />
                <span>Live School Performance</span>
              </Link>
            )}
          </div>
        </div>

        {/* Integrated Filter & Status Bar */}
        {canManage && (
          <div className="pt-3 border-t border-border flex flex-col sm:flex-row sm:items-center gap-2.5">
            <div className="relative flex-1 min-w-[200px]">
              <MagnifyingGlassIcon className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                aria-label="Search school reports"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search school, title, or term…"
                className="w-full min-h-10 rounded-xl border border-border bg-background pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>

            <select
              aria-label="Filter by academic term"
              value={termFilter}
              onChange={(e) => setTermFilter(e.target.value)}
              className="min-h-10 rounded-xl border border-border bg-background px-3 py-2 text-xs sm:text-sm font-semibold text-foreground focus:border-primary focus:outline-none"
            >
              <option value="">All terms</option>
              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.academic_year} · {term.term_label}
                </option>
              ))}
            </select>

            <div className="inline-flex rounded-xl border border-border bg-background p-0.5 overflow-x-auto">
              {(
                [
                  ["all", "All"],
                  ["published", "Published"],
                  ["draft", "Drafts"],
                  ["archived", "Archived"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors ${
                    statusFilter === value
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-600 dark:text-rose-400"
        >
          {error}
        </p>
      ) : null}

      <SchoolReportLibrary
        reports={reports}
        role={role}
        canManage={canManage}
        loading={loading}
        working={working}
        onDelete={deleteReportById}
        page={page}
        pageSize={LIBRARY_PAGE_SIZE}
        totalCount={totalCount}
        hasMore={hasMore}
        onPageChange={setPage}
      />
    </div>
  );
}
