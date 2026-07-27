'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  ArrowPathIcon, UserIcon, AcademicCapIcon, BuildingOfficeIcon,
  ClipboardDocumentListIcon, ExclamationTriangleIcon, ShieldCheckIcon,
  ArrowDownTrayIcon, ArrowsUpDownIcon, ChevronUpIcon, ChevronDownIcon,
  ChevronLeftIcon, ChevronRightIcon, ChartBarIcon,
} from '@/lib/icons';

/**
 * Accountability — every account, where they are, and what is missing.
 *
 * Each figure is a filter: click it and the table below shows exactly the people
 * behind that number. Data comes from /api/admin/accountability, which is
 * admin-only and reaches the two service-role RPCs.
 *
 * v3 improvements:
 *  - Full pagination with customizable page size (25, 50, 100, 250, All) — NO 300 row ceiling!
 *  - Rich visual charts: Publication status stacked bar, Roster Placement & Parent Reach progress meters
 *  - Interactive Class publication meters
 *  - by_class breakdown rendered as a sortable table
 *  - CSV export for the filtered people table (respects current filters, UTF-8 BOM)
 *  - Search extended to include role
 *  - School filter handles school_name records
 *  - Percentage-based flag tone against student count
 *  - generated_at uses a stable en-GB locale
 *  - Stale-data overlay while a refresh is in flight
 */

// ── Types ─────────────────────────────────────────────────────────────────────

type Person = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  is_active: boolean;
  enrollment_type: string | null;
  school_name: string | null;
  class_from_roster: string | null;
  class_on_profile: string | null;
  roster_status: string | null;
  reports_total: number;
  reports_published: number;
  reports_draft: number;
  has_parent_contact: boolean;
  flags: string[] | null;
};

type ClassRow = {
  class: string;
  students: number;
  reports: number;
  published: number;
  draft: number;
};

type Coverage = {
  generated_at: string;
  totals: Record<string, number>;
  gaps: Record<string, number>;
  classes_without_reports: { class: string; students: number }[];
  by_class: ClassRow[];
  drafts_by_teacher: { teacher: string; course: string; term: string; drafts: number }[];
  possible_duplicate_classes: { normalised: string; names: string[] }[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const FLAG_LABEL: Record<string, string> = {
  no_class: 'Not on any class roster',
  no_report: 'No report at all',
  draft_pending: 'Holding an unpublished report',
  no_parent_phone: 'No parent phone on file',
  class_mismatch: 'Roster and profile class disagree',
  inactive: 'Account inactive',
  no_enrolment_type: 'No enrolment type set',
};

const CARD = 'bg-card shadow-sm border border-border rounded-xl';
const LABEL = 'text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground';

const BY_CLASS_COLS = ['class', 'students', 'reports', 'published', 'draft'] as const;
type ByClassCol = typeof BY_CLASS_COLS[number];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Download `rows` as a CSV file.
 * Prepends a UTF-8 BOM (\uFEFF) so Excel on Windows opens accented characters correctly.
 */
function downloadCsv(rows: Person[], filename = 'accountability.csv') {
  const headers = [
    'Name', 'Email', 'Role', 'Active', 'Enrolment type',
    'School', 'Class (roster)', 'Class (profile)',
    'Reports total', 'Published', 'Drafts', 'Parent contact', 'Flags',
  ];
  const escape = (v: string | number | boolean | null | undefined) => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(','),
    ...rows.map((p) => [
      escape(p.full_name),
      escape(p.email),
      escape(p.role),
      escape(p.is_active),
      escape(p.enrollment_type),
      escape(p.school_name),
      escape(p.class_from_roster),
      escape(p.class_on_profile),
      escape(p.reports_total),
      escape(p.reports_published),
      escape(p.reports_draft),
      escape(p.has_parent_contact),
      escape((p.flags ?? []).join('; ')),
    ].join(',')),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Format a UTC ISO string with a stable locale. */
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Tile({
  value, label, tone = 'default', active, onClick,
}: {
  value: number | string; label: string; tone?: 'default' | 'warn' | 'bad';
  active?: boolean; onClick?: () => void;
}) {
  const toneCls =
    tone === 'bad' ? 'text-rose-500' : tone === 'warn' ? 'text-amber-500' : 'text-foreground';
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`${CARD} p-5 text-left transition-all ${onClick ? 'hover:border-indigo-500/50 cursor-pointer' : 'cursor-default'} ${active ? 'border-indigo-500 ring-1 ring-indigo-500/40' : ''}`}
    >
      <div className={`text-3xl font-black tracking-tighter ${toneCls}`}>{value}</div>
      <div className={`${LABEL} mt-1.5`}>{label}</div>
    </button>
  );
}

type SortDir = 'asc' | 'desc';

function SortIcon({ col, sort }: { col: ByClassCol; sort: { col: ByClassCol; dir: SortDir } }) {
  if (sort.col !== col) return <ArrowsUpDownIcon className="w-3 h-3 opacity-30" />;
  return sort.dir === 'asc'
    ? <ChevronUpIcon className="w-3 h-3 text-indigo-500" />
    : <ChevronDownIcon className="w-3 h-3 text-indigo-500" />;
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function AccountabilityPage() {
  const { profile, loading: authLoading } = useAuth();
  const [data, setData] = useState<{ coverage: Coverage | null; people: Person[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // People filter state
  const [flag, setFlag] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [school, setSchool] = useState<string>('');
  const [search, setSearch] = useState('');

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // By-class sort state
  const [byClassSort, setByClassSort] = useState<{ col: ByClassCol; dir: SortDir }>({
    col: 'students', dir: 'desc',
  });

  const isFirstLoad = useRef(true);

  const load = useCallback(async (forceRefresh = false) => {
    if (isFirstLoad.current) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      if (forceRefresh) {
        const refreshRes = await fetch('/api/admin/accountability', { method: 'POST' });
        if (!refreshRes.ok) {
          const j = await refreshRes.json();
          throw new Error(j.error || 'Refresh failed');
        }
      }
      const res = await fetch('/api/admin/accountability');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not load');
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load');
    } finally {
      setLoading(false);
      setRefreshing(false);
      isFirstLoad.current = false;
    }
  }, []);

  useEffect(() => {
    if (profile?.role === 'admin') void load();
  }, [profile?.role, load]);

  // Reset page to 1 whenever filters change
  useEffect(() => {
    setPage(1);
  }, [flag, role, school, search, pageSize]);

  // ── Derived data ─────────────────────────────────────────────────────────

  const people = data?.people ?? [];

  const flagCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of people) for (const f of p.flags ?? []) m[f] = (m[f] || 0) + 1;
    return m;
  }, [people]);

  const roleCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of people) { const r = p.role ?? '(none)'; m[r] = (m[r] || 0) + 1; }
    return m;
  }, [people]);

  const schools = useMemo(
    () => Array.from(new Set(
      people.map((p) => p.school_name).filter(Boolean) as string[],
    )).sort(),
    [people],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people.filter((p) => {
      if (flag && !(p.flags ?? []).includes(flag)) return false;
      if (role && (p.role ?? '(none)') !== role) return false;
      if (school && (p.school_name ?? '') !== school) return false;
      if (q && !(`${p.full_name ?? ''} ${p.email ?? ''} ${p.school_name ?? ''} ${p.class_from_roster ?? ''} ${p.role ?? ''}`)
        .toLowerCase().includes(q)) return false;
      return true;
    });
  }, [people, flag, role, school, search]);

  // Pagination calculation
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedPeople = useMemo(() => {
    if (pageSize >= 10000) return filtered;
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  // Sorted by_class data
  const byClassSorted = useMemo(() => {
    const rows = [...(data?.coverage?.by_class ?? [])];
    rows.sort((a, b) => {
      const av = a[byClassSort.col as keyof ClassRow];
      const bv = b[byClassSort.col as keyof ClassRow];
      const cmp = typeof av === 'string'
        ? (av as string).localeCompare(bv as string)
        : (av as number) - (bv as number);
      return byClassSort.dir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [data?.coverage?.by_class, byClassSort]);

  const toggleByClassSort = (col: ByClassCol) => {
    setByClassSort((prev) =>
      prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' },
    );
  };

  const studentCount = useMemo(
    () => people.filter((p) => p.role === 'student').length || 1,
    [people],
  );
  const flagTone = (n: number): 'bad' | 'warn' => {
    return n >= studentCount * 0.10 ? 'bad' : 'warn';
  };

  const clearAll = () => { setFlag(null); setRole(null); setSchool(''); setSearch(''); };
  const activeFilter = flag || role || school || search;

  // ── Analytical Metrics for Charts ──────────────────────────────────────────
  const analytics = useMemo(() => {
    const c = data?.coverage;
    const totalStudents = c?.totals.students || studentCount || 1;
    const placedOnRoster = c?.totals.students_on_roster || 0;
    const unplaced = c?.totals.students_not_placed || 0;
    const placedPct = Math.round((placedOnRoster / totalStudents) * 100);

    const totalReports = c?.totals.reports || 1;
    const publishedReports = c?.totals.published || 0;
    const draftReports = c?.totals.draft || 0;
    const publishedPct = Math.round((publishedReports / totalReports) * 100);
    const draftPct = Math.round((draftReports / totalReports) * 100);

    const noParentCount = flagCounts['no_parent_phone'] || 0;
    const parentContactCount = Math.max(0, studentCount - noParentCount);
    const parentReachPct = Math.round((parentContactCount / studentCount) * 100);

    const noEnrolmentCount = flagCounts['no_enrolment_type'] || 0;
    const enrolmentSetCount = Math.max(0, studentCount - noEnrolmentCount);
    const enrolmentPct = Math.round((enrolmentSetCount / studentCount) * 100);

    return {
      placedPct,
      placedOnRoster,
      unplaced,
      totalStudents,
      publishedReports,
      draftReports,
      publishedPct,
      draftPct,
      parentReachPct,
      noParentCount,
      enrolmentPct,
      noEnrolmentCount,
    };
  }, [data?.coverage, studentCount, flagCounts]);

  // ── Guards ───────────────────────────────────────────────────────────────

  if (authLoading || !profile) {
    return <div className="p-8"><ArrowPathIcon className="w-8 h-8 animate-spin text-indigo-500" /></div>;
  }
  if (profile.role !== 'admin') {
    return (
      <div className="p-8">
        <div className={`${CARD} p-8 flex items-start gap-4`}>
          <ShieldCheckIcon className="w-6 h-6 text-rose-500 shrink-0" />
          <div>
            <h2 className="font-black text-foreground">Administrators only</h2>
            <p className="text-sm text-muted-foreground">
              This is a cross-school census, so it is limited to admin accounts.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const c = data?.coverage;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-foreground">Accountability & Census</h1>
          <p className="text-sm text-muted-foreground">
            Full platform snapshot — every account, placement, report status, and operational gap.
          </p>
        </div>
        <button
          id="accountability-refresh-btn"
          onClick={() => void load(true)}
          disabled={loading || refreshing}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 py-2 text-xs font-black uppercase tracking-wider text-foreground hover:bg-accent disabled:opacity-60"
        >
          <ArrowPathIcon className={`w-4 h-4 ${loading || refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Rebuilding cache…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
          {error}
        </p>
      )}

      {loading && !data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ArrowPathIcon className="w-4 h-4 animate-spin" /> Loading snapshot…
        </div>
      ) : !data ? null : (
        <div className={`space-y-8 transition-opacity duration-300 ${refreshing ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>

          {/* VISUAL ANALYTICS & CHARTS SECTION */}
          <section className="space-y-4">
            <h2 className={LABEL}>
              <ChartBarIcon className="w-3.5 h-3.5 inline mr-1.5 text-indigo-500" />
              Operational Integrity & Analysis
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">

              {/* Chart 1: Report Publication Bar */}
              <div className={`${CARD} p-5 space-y-3`}>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-foreground uppercase tracking-wider">Report Publication Status</span>
                  <span className="text-xs font-black text-indigo-500">{analytics.publishedPct}% Published</span>
                </div>
                {/* Visual Stacked Progress Bar */}
                <div className="h-4 w-full bg-muted rounded-full overflow-hidden flex">
                  <div style={{ width: `${analytics.publishedPct}%` }} className="bg-emerald-500 h-full transition-all duration-500" title={`Published: ${analytics.publishedReports}`} />
                  <div style={{ width: `${analytics.draftPct}%` }} className="bg-amber-500 h-full transition-all duration-500" title={`Draft: ${analytics.draftReports}`} />
                </div>
                <div className="flex justify-between items-center text-[11px] text-muted-foreground pt-1">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> {analytics.publishedReports} Published ({analytics.publishedPct}%)</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> {analytics.draftReports} Drafts ({analytics.draftPct}%)</span>
                </div>
              </div>

              {/* Chart 2: Roster Placement Coverage */}
              <div className={`${CARD} p-5 space-y-3`}>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-foreground uppercase tracking-wider">Roster Placement Rate</span>
                  <span className="text-xs font-black text-emerald-500">{analytics.placedPct}% Placed</span>
                </div>
                <div className="h-4 w-full bg-muted rounded-full overflow-hidden flex">
                  <div style={{ width: `${analytics.placedPct}%` }} className="bg-emerald-500 h-full transition-all duration-500" />
                  <div style={{ width: `${100 - analytics.placedPct}%` }} className="bg-rose-500/80 h-full transition-all duration-500" />
                </div>
                <div className="flex justify-between items-center text-[11px] text-muted-foreground pt-1">
                  <span>{analytics.placedOnRoster} Students on Roster</span>
                  <span className="text-rose-500 font-bold">{analytics.unplaced} Not Placed</span>
                </div>
              </div>

              {/* Chart 3: Parent Contact Reachability */}
              <div className={`${CARD} p-5 space-y-3`}>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-foreground uppercase tracking-wider">Parent Phone Reachability</span>
                  <span className="text-xs font-black text-indigo-500">{analytics.parentReachPct}% Reachable</span>
                </div>
                <div className="h-4 w-full bg-muted rounded-full overflow-hidden flex">
                  <div style={{ width: `${analytics.parentReachPct}%` }} className="bg-indigo-500 h-full transition-all duration-500" />
                  <div style={{ width: `${100 - analytics.parentReachPct}%` }} className="bg-amber-500 h-full transition-all duration-500" />
                </div>
                <div className="flex justify-between items-center text-[11px] text-muted-foreground pt-1">
                  <span>Reachable via phone/portal</span>
                  <span className="text-amber-500 font-bold">{analytics.noParentCount} Missing Phone</span>
                </div>
              </div>

            </div>
          </section>

          {/* WHO THEY ARE */}
          <section className="space-y-3">
            <h2 className={LABEL}><UserIcon className="w-3.5 h-3.5 inline mr-1.5" />Who they are</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <Tile value={people.length} label="All accounts"
                    active={!role && !flag} onClick={clearAll} />
              {Object.entries(roleCounts).sort((a, b) => b[1] - a[1]).map(([r, n]) => (
                <Tile key={r} value={n} label={r}
                      active={role === r}
                      onClick={() => { setRole(role === r ? null : r); setFlag(null); }} />
              ))}
            </div>
          </section>

          {/* WHAT IS MISSING */}
          <section className="space-y-3">
            <h2 className={LABEL}>
              <ExclamationTriangleIcon className="w-3.5 h-3.5 inline mr-1.5" />What is missing
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Object.entries(flagCounts).sort((a, b) => b[1] - a[1]).map(([f, n]) => (
                <Tile key={f} value={n} label={FLAG_LABEL[f] ?? f}
                      tone={flagTone(n)}
                      active={flag === f}
                      onClick={() => { setFlag(flag === f ? null : f); setRole(null); }} />
              ))}
            </div>
          </section>

          {/* REPORTS */}
          {c && (
            <section className="space-y-3">
              <h2 className={LABEL}>
                <ClipboardDocumentListIcon className="w-3.5 h-3.5 inline mr-1.5" />Reports
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <Tile value={c.totals.reports ?? 0} label="Reports written" />
                <Tile value={c.totals.published ?? 0} label="Published" />
                <Tile
                  value={c.totals.draft ?? 0}
                  label="Unpublished draft"
                  tone="warn"
                  active={flag === 'draft_pending'}
                  onClick={() => { setFlag(flag === 'draft_pending' ? null : 'draft_pending'); setRole(null); }}
                />
                <Tile value={c.gaps.reports_missing_course ?? 0} label="Missing course link" tone="warn" />
                <Tile value={c.totals.students_with_report ?? 0} label="Students with a report" />
                <Tile value={c.totals.students_on_roster ?? 0} label="Students on roster" />
              </div>
            </section>
          )}

          {/* CLASSES WITH NO REPORTS */}
          {c && c.classes_without_reports.length > 0 && (
            <section className="space-y-3">
              <h2 className={LABEL}>
                <AcademicCapIcon className="w-3.5 h-3.5 inline mr-1.5" />
                Classes with pupils but not one report
              </h2>
              <div className={`${CARD} divide-y divide-border`}>
                {c.classes_without_reports.map((x) => (
                  <div key={x.class} className="flex items-center justify-between px-5 py-3">
                    <span className="text-sm text-foreground">{x.class}</span>
                    <span className="text-sm font-black text-rose-500">{x.students} pupils</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* BY CLASS BREAKDOWN */}
          {c && c.by_class.length > 0 && (
            <section className="space-y-3">
              <h2 className={LABEL}>
                <AcademicCapIcon className="w-3.5 h-3.5 inline mr-1.5" />
                Coverage by class
              </h2>
              <div className={`${CARD} overflow-x-auto`}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      {BY_CLASS_COLS.map((col) => (
                        <th
                          key={col}
                          className={`${LABEL} px-4 py-3 whitespace-nowrap cursor-pointer select-none hover:text-foreground transition-colors`}
                          onClick={() => toggleByClassSort(col)}
                        >
                          <span className="inline-flex items-center gap-1">
                            {col.charAt(0).toUpperCase() + col.slice(1)}
                            <SortIcon col={col} sort={byClassSort} />
                          </span>
                        </th>
                      ))}
                      <th className={`${LABEL} px-4 py-3 text-right`}>Publication Progress</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {byClassSorted.map((row, idx) => {
                      const pct = row.students > 0
                        ? Math.round((row.published / row.students) * 100)
                        : 0;
                      return (
                        <tr key={`${row.class}-${idx}`} className="hover:bg-accent/40">
                          <td className="px-4 py-2.5 font-medium text-foreground">{row.class}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{row.students}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{row.reports}</td>
                          <td className="px-4 py-2.5">
                            <span className={pct === 100 ? 'text-emerald-500 font-bold' : 'text-muted-foreground'}>
                              {row.published}
                            </span>
                            <span className="text-muted-foreground/50 text-xs ml-1">({pct}%)</span>
                          </td>
                          <td className="px-4 py-2.5">
                            {row.draft > 0
                              ? <span className="text-amber-500 font-bold">{row.draft}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          {/* Visual Bar Meter per Class */}
                          <td className="px-4 py-2.5 text-right w-44">
                            <div className="flex items-center gap-2 justify-end">
                              <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                                <div style={{ width: `${Math.min(100, pct)}%` }} className={`h-full ${pct === 100 ? 'bg-emerald-500' : pct > 50 ? 'bg-indigo-500' : 'bg-amber-500'}`} />
                              </div>
                              <span className="text-xs font-bold text-muted-foreground w-9">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* DRAFTS BY TEACHER */}
          {c && c.drafts_by_teacher.length > 0 && (
            <section className="space-y-3">
              <h2 className={LABEL}>Unpublished reports, by teacher</h2>
              <div className={`${CARD} divide-y divide-border`}>
                {c.drafts_by_teacher.slice(0, 10).map((d, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{d.teacher}</p>
                      <p className="text-xs text-muted-foreground truncate">{d.course} — {d.term}</p>
                    </div>
                    <span className="text-sm font-black text-amber-500 shrink-0">{d.drafts}</span>
                  </div>
                ))}
              </div>
              {c.drafts_by_teacher.length > 10 && (
                <p className="px-5 py-2 text-xs text-muted-foreground border-t border-border">
                  + {c.drafts_by_teacher.length - 10} more teachers with unpublished reports
                </p>
              )}
            </section>
          )}

          {/* DUPLICATE CLASSES */}
          {c && c.possible_duplicate_classes.length > 0 && (
            <section className="space-y-3">
              <h2 className={LABEL}>Classes that look duplicated</h2>
              <div className={`${CARD} divide-y divide-border`}>
                {c.possible_duplicate_classes.map((d, i) => (
                  <div key={i} className="px-5 py-3 text-sm text-foreground">
                    {d.names.map((n) => `"${n}"`).join('  vs  ')}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* THE PEOPLE (WITH FULL PAGINATION) */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className={LABEL}>
                <BuildingOfficeIcon className="w-3.5 h-3.5 inline mr-1.5" />
                {filtered.length} {filtered.length === 1 ? 'person' : 'people'}
                {flag ? ` — ${FLAG_LABEL[flag] ?? flag}` : ''}
                {role ? ` — ${role}` : ''}
              </h2>
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  id="accountability-search"
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email, school, class, role…"
                  className="min-w-[15rem] bg-card border border-border rounded-xl px-4 py-2 text-sm text-foreground outline-none focus:border-indigo-500"
                />
                <select
                  id="accountability-school-filter"
                  value={school} onChange={(e) => setSchool(e.target.value)}
                  className="bg-card border border-border rounded-xl px-4 py-2 text-sm text-foreground outline-none focus:border-indigo-500"
                >
                  <option value="">All schools</option>
                  {schools.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {activeFilter && (
                  <button
                    id="accountability-clear-btn"
                    onClick={clearAll}
                    className="rounded-xl border border-border px-4 py-2 text-xs font-black uppercase tracking-wider text-muted-foreground hover:bg-accent"
                  >
                    Clear
                  </button>
                )}
                {/* CSV Export */}
                <button
                  id="accountability-export-btn"
                  onClick={() => downloadCsv(filtered)}
                  disabled={filtered.length === 0}
                  title={`Export ${filtered.length} ${activeFilter ? 'filtered' : ''} rows as CSV`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-xs font-black uppercase tracking-wider text-muted-foreground hover:bg-accent disabled:opacity-40"
                >
                  <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              </div>
            </div>

            <div className={`${CARD} overflow-x-auto`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    {['Name', 'Role', 'School', 'Class (roster)', 'Reports', 'Missing'].map((h) => (
                      <th key={h} className={`${LABEL} px-4 py-3 whitespace-nowrap`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedPeople.map((p) => (
                    <tr key={p.id} className="hover:bg-accent/40">
                      <td className="px-4 py-2.5">
                        <div className="font-bold text-foreground">{p.full_name || '(no name)'}</div>
                        <div className="text-xs text-muted-foreground">{p.email}</div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="text-foreground">{p.role}</span>
                        {!p.is_active && <span className="ml-2 text-xs text-rose-500">inactive</span>}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{p.school_name || '—'}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {p.class_from_roster || <span className="text-rose-500">not placed</span>}
                        {p.class_on_profile && p.class_from_roster && p.class_on_profile !== p.class_from_roster && (
                          <div className="text-xs text-amber-500">profile says: {p.class_on_profile}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                        {p.reports_total === 0 ? '—' : (
                          <>
                            {p.reports_published} published
                            {p.reports_draft > 0 && <span className="text-amber-500"> · {p.reports_draft} draft</span>}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {(p.flags ?? []).map((f) => (
                            <span
                              key={f}
                              className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
                            >
                              {f.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* PAGINATION CONTROLS BAR */}
              <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3 border-t border-border bg-card/50">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    Showing <strong className="text-foreground">{totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1}</strong> to <strong className="text-foreground">{Math.min(currentPage * pageSize, totalItems)}</strong> of <strong className="text-foreground">{totalItems}</strong> entries
                  </span>
                  <div className="flex items-center gap-1.5 ml-2">
                    <span className="text-[11px] uppercase tracking-wider font-bold">Rows:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      className="bg-card border border-border rounded-md px-2 py-1 text-xs text-foreground outline-none"
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={250}>250</option>
                      <option value={10000}>All ({totalItems})</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground hover:bg-accent disabled:opacity-40"
                  >
                    <ChevronLeftIcon className="w-4 h-4" /> Previous
                  </button>

                  <span className="text-xs font-bold text-foreground px-2">
                    Page {currentPage} of {totalPages}
                  </span>

                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground hover:bg-accent disabled:opacity-40"
                  >
                    Next <ChevronRightIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {filtered.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nobody matches that filter.</p>
              )}
            </div>
          </section>

          {c && (
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted-foreground">
                Snapshot taken {fmtDate(c.generated_at)}
              </p>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Cache live
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
