"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SchoolReportLibrary } from "@/components/school-reports/SchoolReportLibrary";
import {
  AcademicCapIcon,
  ArrowRightIcon,
  DocumentTextIcon,
  ShieldCheckIcon,
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
  const publishedCount = reports.filter(
    (report) => report.status === "published"
  ).length;
  const draftCount = reports.filter(
    (report) => report.status === "draft"
  ).length;

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
    <div className="mx-auto max-w-7xl space-y-7 p-4 md:p-8">
      <header className="rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-card to-emerald-500/5 p-5 shadow-sm sm:p-7">
        <Link
          href="/dashboard/academic"
          className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-primary hover:underline"
        >
          <AcademicCapIcon className="h-4 w-4" /> Academic Office
        </Link>
        <p className="mt-5 text-xs font-black uppercase tracking-[0.25em] text-primary">
          Official school report books
        </p>
        <h1 className="mt-2 max-w-4xl text-3xl font-black tracking-tight text-foreground sm:text-4xl">
          Turn verified teaching records into a client-ready report
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Results, attendance, class work, curriculum delivery and finance are
          brought together for review. Manual records stay protected and are
          used as trusted evidence; curriculum direction is never edited here.
        </p>
      </header>

      <section
        aria-label="Report workflow"
        className="grid gap-3 sm:grid-cols-3"
      >
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-primary">
            1. Select
          </p>
          <p className="mt-1 text-sm font-bold text-foreground">
            School and academic period
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-primary">
            2. Review
          </p>
          <p className="mt-1 text-sm font-bold text-foreground">
            Evidence, wording and presentation
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <DocumentTextIcon className="h-5 w-5 text-primary" />
          <p className="text-xs font-black uppercase tracking-wide text-primary">
            3. Deliver
          </p>
          <p className="mt-1 text-sm font-bold text-foreground">
            Publish the official client PDF
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 font-bold text-emerald-700 dark:text-emerald-300">
          <ShieldCheckIcon className="h-4 w-4" /> Manual records protected
        </span>
        <span className="rounded-full border border-border bg-card px-3 py-1.5 font-bold text-muted-foreground">
          {publishedCount} published on this page
        </span>
        <span className="rounded-full border border-border bg-card px-3 py-1.5 font-bold text-muted-foreground">
          {draftCount} drafts on this page
        </span>
        <Link
          href="/dashboard/academic/guide"
          className="inline-flex items-center gap-1 px-2 py-1.5 font-black text-primary hover:underline"
        >
          How reports connect <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-600 dark:text-rose-400"
        >
          {error}
        </p>
      ) : null}

      {canManage ? (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
          <label className="min-w-[220px] flex-1 space-y-1">
            <span className="text-xs font-black uppercase text-muted-foreground">
              Search
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Title, school, term, or year"
              className="w-full rounded-xl border border-border bg-background p-3 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-muted-foreground">
              Term
            </span>
            <select
              value={termFilter}
              onChange={(e) => setTermFilter(e.target.value)}
              className="rounded-xl border border-border bg-background p-3 text-sm"
            >
              <option value="">All terms</option>
              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.academic_year} · {term.term_label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-muted-foreground">
              Status
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="rounded-xl border border-border bg-background p-3 text-sm"
            >
              <option value="all">All active</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>
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
