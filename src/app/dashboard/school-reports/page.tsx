'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SchoolReportLibrary } from '@/components/school-reports/SchoolReportLibrary';
import type { ReportListItem } from '@/lib/school-reports/ui/types';

type StatusFilter = 'all' | 'draft' | 'published';
const LIBRARY_PAGE_SIZE = 12;

export default function SchoolReportsLibraryPage() {
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);

  const canManage = role === 'admin' || role === 'teacher';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/school-performance-reports', { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to load reports.');
      setReports(json.data || []);
      setRole(json.role || '');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load reports.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function deleteReportById(report: ReportListItem) {
    if (report.status === 'published') {
      setError('Withdraw this published report first, then you can delete the draft.');
      return;
    }
    if (
      !window.confirm(
        `Delete "${report.title}" permanently? This removes the draft book for ${report.school_name} and cannot be undone.`,
      )
    ) {
      return;
    }
    setWorking('delete');
    setError('');
    try {
      const response = await fetch(`/api/school-performance-reports/${report.id}`, { method: 'DELETE' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to delete report.');
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete report.');
    } finally {
      setWorking('');
    }
  }

  const sortedReports = useMemo(
    () =>
      [...reports]
        .filter((row) => row.status !== 'archived')
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [reports],
  );

  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sortedReports.filter((report) => {
      if (statusFilter !== 'all' && report.status !== statusFilter) return false;
      if (!query) return true;
      return (
        report.title.toLowerCase().includes(query) ||
        report.school_name.toLowerCase().includes(query) ||
        report.term_label.toLowerCase().includes(query) ||
        report.academic_year.toLowerCase().includes(query)
      );
    });
  }, [search, sortedReports, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const paginatedReports = useMemo(() => {
    const start = (page - 1) * LIBRARY_PAGE_SIZE;
    return filteredReports.slice(start, start + LIBRARY_PAGE_SIZE);
  }, [filteredReports, page]);

  return (
    <div className="mx-auto max-w-7xl space-y-7 p-4 md:p-8">
      <header>
        <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Reports and analytics</p>
        <h1 className="mt-2 text-3xl font-black text-foreground">School performance reports</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Create one professional report from Manual Result Entry, attendance rolls, class work and curriculum coverage.
          Staff review wording before the school sees it.
        </p>
      </header>

      {error ? (
        <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-600">
          {error}
        </p>
      ) : null}

      {canManage ? (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4">
          <label className="min-w-[220px] flex-1 space-y-1">
            <span className="text-xs font-black uppercase text-muted-foreground">Search</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Title, school, term, or year"
              className="w-full rounded-xl border border-border bg-background p-3 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-black uppercase text-muted-foreground">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="rounded-xl border border-border bg-background p-3 text-sm"
            >
              <option value="all">All active</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
        </div>
      ) : null}

      <SchoolReportLibrary
        reports={paginatedReports}
        role={role}
        canManage={canManage}
        loading={loading}
        working={working}
        onDelete={deleteReportById}
        page={page}
        pageSize={LIBRARY_PAGE_SIZE}
        totalCount={filteredReports.length}
        onPageChange={setPage}
      />
    </div>
  );
}
