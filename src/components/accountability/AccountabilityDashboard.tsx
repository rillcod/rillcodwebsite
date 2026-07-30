'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AcademicCapIcon, ArrowDownTrayIcon, ArrowPathIcon, BuildingOfficeIcon,
  ChartBarIcon, CheckCircleIcon, ClipboardDocumentListIcon, CogIcon,
  EnvelopeIcon, ExclamationTriangleIcon, InformationCircleIcon, LinkIcon,
  PaperAirplaneIcon, PhoneIcon, ShieldCheckIcon, UserGroupIcon, UserIcon,
  UserPlusIcon,
} from '@/lib/icons';
import {
  CHART_COLORS, DonutChart, StackedBarChart, VerticalBarChart,
} from '@/components/charts';
import { RoleBadge, RoleLegend } from '@/components/accountability/RoleBadge';
import ParentReachOutModal, { ReachOutPersonTarget } from '@/components/accountability/ParentReachOutModal';
import TeacherAccountabilityPanel from '@/components/accountability/TeacherAccountabilityPanel';
import { AtRiskList } from '@/components/analytics/AtRiskList';
import {
  AccountabilityTab, Backlog, ClassRow, Coverage, FLAG_LABEL, Person,
  fmtDate, isStudent, isTeacher, normalizeRole, roleMeta,
} from '@/lib/accountability/types';
import { downloadPeopleCsv, generateAccountabilityPdf } from '@/lib/accountability/report';

const CARD = 'bg-card shadow-sm border border-border rounded-xl';
const LABEL = 'text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground';

const TABS: { id: AccountabilityTab; label: string; hint: string }[] = [
  { id: 'overview', label: 'Overview', hint: 'Health, roles & gaps' },
  { id: 'people', label: 'People census', hint: 'Every account by role' },
  { id: 'teachers', label: 'Teachers', hint: 'Per-class results & publish' },
  { id: 'reports', label: 'Reports & classes', hint: 'Coverage by class' },
  { id: 'comms', label: 'Communications', hint: 'Email reach & providers' },
  { id: 'report', label: 'Full report', hint: 'Generate PDF / CSV' },
];

function Tile({
  value, label, tone = 'default', active, onClick, sub,
}: {
  value: number | string; label: string; tone?: 'default' | 'warn' | 'bad' | 'good';
  active?: boolean; onClick?: () => void; sub?: string;
}) {
  const toneCls =
    tone === 'bad' ? 'text-rose-600 dark:text-rose-400'
      : tone === 'warn' ? 'text-amber-600 dark:text-amber-400'
        : tone === 'good' ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-foreground';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`${CARD} p-4 sm:p-5 text-left transition-all w-full ${onClick ? 'hover:border-indigo-500/50 cursor-pointer' : 'cursor-default'} ${active ? 'border-indigo-500 ring-1 ring-indigo-500/40' : ''}`}
    >
      <div className={`text-2xl sm:text-3xl font-black tracking-tighter tabular-nums ${toneCls}`}>{value}</div>
      <div className={`${LABEL} mt-1.5`}>{label}</div>
      {sub && <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{sub}</p>}
    </button>
  );
}

function Section({
  title, icon, children, action,
}: {
  title: string; icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={`${LABEL} flex items-center gap-1.5`}>
          {icon}{title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

type Props = {
  coverage: Coverage | null;
  people: Person[];
  backlog: Backlog | null;
  exceptionTotals?: Partial<Record<'displaced' | 'hollow_shell' | 'placeholder_noise' | 'withdrawn_active' | 'class_mismatch' | 'missing_parent_contact', number>>;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  syncFeedback: string | null;
  syncingClasses: boolean;
  pollInterval: number;
  setPollInterval: (n: number) => void;
  onRefresh: (force?: boolean) => void;
  onSyncClasses: () => void;
  generatedBy?: string;
};

const ACADEMIC_EXCEPTIONS_HREF = '/dashboard/academic#academic-exceptions';

export default function AccountabilityDashboard({
  coverage: c,
  people,
  backlog,
  exceptionTotals,
  loading,
  refreshing,
  error,
  syncFeedback,
  syncingClasses,
  pollInterval,
  setPollInterval,
  onRefresh,
  onSyncClasses,
  generatedBy,
}: Props) {
  const [tab, setTab] = useState<AccountabilityTab>('overview');
  const [reachOutModalOpen, setReachOutModalOpen] = useState(false);
  const [reachOutPerson, setReachOutPerson] = useState<Person | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [flag, setFlag] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [school, setSchool] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [peopleSort, setPeopleSort] = useState<'name' | 'role' | 'school'>('role');
  const [reportBusy, setReportBusy] = useState(false);
  const [reportMsg, setReportMsg] = useState<string | null>(null);

  const flagCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of people) for (const f of p.flags ?? []) m[f] = (m[f] || 0) + 1;
    return m;
  }, [people]);

  const roleCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of people) {
      const r = normalizeRole(p.role);
      m[r] = (m[r] || 0) + 1;
    }
    return m;
  }, [people]);

  const students = useMemo(() => people.filter(isStudent), [people]);
  const teachers = useMemo(() => people.filter(isTeacher), [people]);
  const parents = useMemo(() => people.filter((p) => normalizeRole(p.role) === 'parent'), [people]);

  const schools = useMemo(
    () => Array.from(new Set(people.map((p) => p.school_name).filter(Boolean) as string[])).sort(),
    [people],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = people.filter((p) => {
      if (flag && !(p.flags ?? []).includes(flag)) return false;
      if (role && normalizeRole(p.role) !== role) return false;
      if (school && (p.school_name ?? '') !== school) return false;
      if (q && !(`${p.full_name ?? ''} ${p.email ?? ''} ${p.school_name ?? ''} ${p.class_from_roster ?? ''} ${p.role ?? ''} ${roleMeta(p.role).label}`)
        .toLowerCase().includes(q)) return false;
      return true;
    });
    rows.sort((a, b) => {
      if (peopleSort === 'role') {
        const rc = normalizeRole(a.role).localeCompare(normalizeRole(b.role));
        if (rc !== 0) return rc;
      }
      if (peopleSort === 'school') {
        const sc = (a.school_name || '').localeCompare(b.school_name || '');
        if (sc !== 0) return sc;
      }
      return (a.full_name || '').localeCompare(b.full_name || '');
    });
    return rows;
  }, [people, flag, role, school, search, peopleSort]);

  const selectedPeopleTargets: ReachOutPersonTarget[] = useMemo(
    () => people.filter((p) => selectedIds.has(p.id)),
    [people, selectedIds],
  );

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedPeople = useMemo(() => {
    if (pageSize >= 10000) return filtered;
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const allPaginatedSelected = paginatedPeople.length > 0 && paginatedPeople.every((p) => selectedIds.has(p.id));

  const studentCount = students.length || 1;

  const analytics = useMemo(() => {
    const totalStudents = c?.totals.students || studentCount || 1;
    const placedOnRoster = c?.totals.students_on_roster || 0;
    const unplaced = c?.totals.students_not_placed || flagCounts.no_class || 0;
    const placedPct = Math.round((placedOnRoster / Math.max(totalStudents, 1)) * 100);
    const totalReports = c?.totals.reports || 1;
    const publishedReports = c?.totals.published || 0;
    const draftReports = c?.totals.draft || 0;
    const publishedPct = Math.round((publishedReports / totalReports) * 100);
    const draftPct = Math.round((draftReports / totalReports) * 100);
    const parentEmailMatched = c?.totals.parent_email_matched ?? Math.max(0, studentCount - (flagCounts.no_parent_email || 0));
    const parentPhoneMatched = c?.totals.parent_phone_matched ?? Math.max(0, studentCount - (flagCounts.no_parent_phone || 0));
    const parentFullyMatched = c?.totals.parent_fully_matched ?? 0;
    const parentUnmatched = c?.totals.parent_unmatched ?? 0;
    const parentEmailReachPct = Math.round((parentEmailMatched / Math.max(totalStudents, 1)) * 100);
    const parentPhoneReachPct = Math.round((parentPhoneMatched / Math.max(totalStudents, 1)) * 100);
    const parentFullyMatchedPct = Math.round((parentFullyMatched / Math.max(totalStudents, 1)) * 100);
    const withdrawnCount = c?.totals.withdrawn_students || flagCounts.withdrawn || 0;
    const mismatchCount = flagCounts.class_mismatch || 0;
    // Current = active student accounts that are not withdrawn
    const currentActive = students.filter(
      (p) => p.is_active && !(p.flags ?? []).includes('withdrawn'),
    ).length;
    const inactiveStudents = students.filter((p) => !p.is_active).length;
    // Displaced = not on any active-term roster (same as unplaced / no_class)
    const displacedCount = unplaced;
    const classCount = c?.by_class?.length || 0;
    const classesWithMissing = (c?.by_class ?? []).filter((row) => {
      const missing = row.missing ?? Math.max(0, row.students - (row.published + row.draft));
      return missing > 0;
    }).length;
    const healthScore = Math.min(100, Math.max(0, Math.round(
      placedPct * 0.3 + publishedPct * 0.3 + parentEmailReachPct * 0.2 + parentPhoneReachPct * 0.2,
    )));
    return {
      placedPct, placedOnRoster, unplaced, totalStudents,
      publishedReports, draftReports, publishedPct, draftPct,
      parentEmailMatched, parentPhoneMatched, parentFullyMatched, parentUnmatched,
      parentEmailReachPct, parentPhoneReachPct, parentFullyMatchedPct,
      noParentEmailCount: flagCounts.no_parent_email || 0,
      noParentPhoneCount: flagCounts.no_parent_phone || 0,
      withdrawnCount,
      mismatchCount,
      currentActive,
      inactiveStudents,
      displacedCount,
      classCount,
      classesWithMissing,
      healthScore,
    };
  }, [c, studentCount, flagCounts, students]);

  const statusDonut = useMemo(() => {
    const current = analytics.currentActive;
    const withdrawn = analytics.withdrawnCount;
    const displaced = analytics.displacedCount;
    const otherInactive = Math.max(0, analytics.inactiveStudents - Math.min(analytics.inactiveStudents, withdrawn));
    return [
      { label: 'Current (active)', value: current, color: CHART_COLORS.emerald },
      { label: 'Withdrawn / ended', value: withdrawn, color: CHART_COLORS.rose },
      { label: 'Other inactive', value: otherInactive, color: '#71717a' },
      { label: 'Displaced (no roster)', value: displaced, color: CHART_COLORS.amber },
    ].filter((s) => s.value > 0);
  }, [analytics]);

  const roleDonut = useMemo(() => {
    const palette: Record<string, string> = {
      student: CHART_COLORS.cyan,
      teacher: CHART_COLORS.violet,
      parent: CHART_COLORS.emerald,
      admin: CHART_COLORS.amber,
      school: CHART_COLORS.rose,
      '(none)': '#71717a',
    };
    return Object.entries(roleCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([r, value]) => ({
        label: roleMeta(r).label,
        value,
        color: palette[r] || CHART_COLORS.blue,
      }));
  }, [roleCounts]);

  const classChartData = useMemo(() => {
    return (c?.by_class ?? []).slice(0, 12).map((row) => {
      const missing = row.missing ?? Math.max(0, row.students - (row.published + row.draft));
      return {
        class: row.class.length > 14 ? `${row.class.slice(0, 12)}…` : row.class,
        published: row.published,
        draft: row.draft,
        missing,
      };
    });
  }, [c?.by_class]);

  const openReachOut = (person?: Person) => {
    setReachOutPerson(person || null);
    setReachOutModalOpen(true);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPaginatedSelected) {
        for (const p of paginatedPeople) next.delete(p.id);
      } else {
        for (const p of paginatedPeople) next.add(p.id);
      }
      return next;
    });
  };

  const clearFilters = () => {
    setFlag(null);
    setRole(null);
    setSchool('');
    setSearch('');
    setSelectedIds(new Set());
    setPage(1);
  };

  const focusRole = (r: string | null) => {
    setRole(r);
    setFlag(null);
    setPage(1);
    setTab('people');
  };

  const focusFlag = (f: string | null) => {
    setFlag(f);
    setRole(f && ['no_class', 'no_parent_email', 'no_parent_phone', 'no_report', 'class_mismatch', 'withdrawn', 'no_enrolment_type'].includes(f) ? 'student' : null);
    setPage(1);
    setTab('people');
  };

  const handleGeneratePdf = async () => {
    setReportBusy(true);
    setReportMsg(null);
    try {
      await generateAccountabilityPdf({
        coverage: c,
        people,
        backlog,
        generatedBy,
      });
      setReportMsg('PDF report downloaded.');
    } catch (e) {
      setReportMsg(`Error: ${e instanceof Error ? e.message : 'Could not generate PDF'}`);
    } finally {
      setReportBusy(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tighter text-foreground">
              Accountability Census
            </h1>
            {pollInterval > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-[10px] font-black text-rose-600 dark:text-rose-400 border border-rose-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />
                LIVE {pollInterval / 1000}s
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Structured census of every account by true role — students, teachers, parents, and staff —
            with report coverage, parent reachability, and a downloadable concrete report.
          </p>
          {c?.term_context && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-400">
              Active term: {c.term_context.academic_year} · {c.term_context.term_label}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openReachOut()}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-indigo-600 text-white px-3.5 py-2 text-xs font-black uppercase tracking-wider hover:bg-indigo-700"
          >
            <PaperAirplaneIcon className="w-4 h-4" /> Template Machine
          </button>
          <select
            value={pollInterval}
            onChange={(e) => setPollInterval(Number(e.target.value))}
            className="min-h-10 rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground"
            aria-label="Live monitor interval"
          >
            <option value={0}>Monitor: Off</option>
            <option value={15000}>Monitor: 15s</option>
            <option value={30000}>Monitor: 30s</option>
            <option value={60000}>Monitor: 60s</option>
          </select>
          <button
            type="button"
            onClick={() => onRefresh(true)}
            disabled={loading || refreshing}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-xs font-black uppercase tracking-wider hover:bg-accent disabled:opacity-60"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading || refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>
      )}
      {syncFeedback && (
        <p className={`rounded-xl border px-4 py-3 text-sm font-bold flex items-center gap-2 ${syncFeedback.startsWith('Error') ? 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>
          <CheckCircleIcon className="w-4 h-4" /> {syncFeedback}
        </p>
      )}

      {/* Tabs */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex min-w-max gap-1 rounded-2xl border border-border bg-muted/30 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-xl px-3.5 py-2 text-left transition-all ${tab === t.id ? 'bg-card shadow-sm border border-border' : 'hover:bg-card/60'}`}
            >
              <div className={`text-xs font-black ${tab === t.id ? 'text-foreground' : 'text-muted-foreground'}`}>{t.label}</div>
              <div className="text-[10px] text-muted-foreground hidden sm:block">{t.hint}</div>
            </button>
          ))}
        </div>
      </div>

      {loading && people.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
          <ArrowPathIcon className="w-5 h-5 animate-spin" /> Loading census snapshot…
        </div>
      ) : (
        <div className={`space-y-6 transition-opacity ${refreshing ? 'opacity-50 pointer-events-none' : ''}`}>

          {/* ── OVERVIEW ─────────────────────────────────────────── */}
          {tab === 'overview' && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className={`${CARD} p-5 sm:p-6 lg:col-span-4 flex flex-col justify-between`}>
                  <div>
                    <span className={LABEL}>Platform operational health</span>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className={`text-5xl font-black tracking-tighter tabular-nums ${analytics.healthScore >= 85 ? 'text-emerald-600 dark:text-emerald-400' : analytics.healthScore >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {analytics.healthScore}%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Weighted from roster placement, report publication, and parent email/phone reach.
                    </p>
                  </div>
                  <div className="w-full bg-muted h-2.5 rounded-full overflow-hidden mt-5">
                    <div
                      style={{ width: `${analytics.healthScore}%` }}
                      className={`h-full ${analytics.healthScore >= 85 ? 'bg-emerald-500' : analytics.healthScore >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`}
                    />
                  </div>
                </div>

                <div className={`${CARD} p-5 sm:p-6 lg:col-span-8 space-y-4`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                        <ShieldCheckIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        Quick actions & focus
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Jump to gaps, sync class mismatches, or open parent outreach.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedIds.size > 0 ? (
                        <button type="button" onClick={() => setReachOutModalOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white px-3 py-2 text-xs font-black uppercase tracking-wider">
                          <UserGroupIcon className="w-4 h-4" /> Reach {selectedIds.size} selected
                        </button>
                      ) : (
                        <button type="button" onClick={() => openReachOut()} className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-3 py-2 text-xs font-black uppercase tracking-wider">
                          <PaperAirplaneIcon className="w-3.5 h-3.5" /> Reach parents
                        </button>
                      )}
                      {analytics.mismatchCount > 0 && (
                        <button type="button" onClick={onSyncClasses} disabled={syncingClasses} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 text-white px-3 py-2 text-xs font-black uppercase tracking-wider disabled:opacity-50">
                          <CogIcon className={`w-3.5 h-3.5 ${syncingClasses ? 'animate-spin' : ''}`} />
                          Fix {analytics.mismatchCount} class mismatches
                        </button>
                      )}
                      <button type="button" onClick={() => setTab('report')} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-black uppercase tracking-wider hover:bg-accent">
                        <ArrowDownTrayIcon className="w-3.5 h-3.5" /> Full report
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                    {[
                      { f: 'no_class', label: `Unplaced (${analytics.unplaced})`, tone: 'rose' },
                      { f: 'no_parent_email', label: `No parent email (${analytics.noParentEmailCount})`, tone: 'amber' },
                      { f: 'no_parent_phone', label: `No parent phone (${analytics.noParentPhoneCount})`, tone: 'amber' },
                      { f: 'draft_pending', label: `Draft reports (${analytics.draftReports})`, tone: 'amber' },
                    ].map((x) => (
                      <button
                        key={x.f}
                        type="button"
                        onClick={() => focusFlag(x.f)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${flag === x.f ? 'bg-foreground text-background border-foreground' : 'bg-card border-border hover:border-indigo-500/40'}`}
                      >
                        {x.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <Section title="Who they are — every role counted" icon={<UserIcon className="w-3.5 h-3.5" />}>
                <RoleLegend />
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-2">
                  <div className={`${CARD} p-4 sm:p-5 lg:col-span-4`}>
                    <DonutChart
                      data={roleDonut}
                      height={220}
                      centerValue={people.length}
                      centerLabel="Accounts"
                    />
                    <div className="mt-2 space-y-1.5">
                      {roleDonut.map((s) => (
                        <button
                          key={s.label}
                          type="button"
                          onClick={() => {
                            const entry = Object.entries(roleCounts).find(([r]) => roleMeta(r).label === s.label);
                            focusRole(entry ? entry[0] : null);
                          }}
                          className="flex w-full items-center justify-between text-xs hover:bg-accent/50 rounded-lg px-2 py-1.5"
                        >
                          <span className="flex items-center gap-2 font-bold text-foreground">
                            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
                            {s.label}
                          </span>
                          <span className="tabular-nums font-black text-muted-foreground">{s.value}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Tile value={people.length} label="All accounts" active={!role && !flag} onClick={clearFilters} sub="Full census" />
                    <Tile value={students.length} label="Students" tone="default" active={role === 'student'} onClick={() => focusRole(role === 'student' ? null : 'student')} sub="Learners only" />
                    <Tile value={teachers.length} label="Teachers" tone="default" active={role === 'teacher'} onClick={() => focusRole(role === 'teacher' ? null : 'teacher')} sub="Teaching staff — never mixed as students" />
                    <Tile value={parents.length} label="Parents" active={role === 'parent'} onClick={() => focusRole(role === 'parent' ? null : 'parent')} sub="Guardian accounts" />
                    <Tile value={roleCounts.admin || 0} label="Admins" active={role === 'admin'} onClick={() => focusRole(role === 'admin' ? null : 'admin')} />
                    <Tile value={roleCounts.school || 0} label="School accounts" active={role === 'school'} onClick={() => focusRole(role === 'school' ? null : 'school')} />
                  </div>
                </div>
              </Section>

              <Section title="Student status & placement" icon={<UserGroupIcon className="w-3.5 h-3.5" />}>
                <p className="text-xs text-muted-foreground -mt-1">
                  Current active learners vs withdrawn, displaced (no roster), and class-mismatch — click any tile to open the matching people list.
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <div className={`${CARD} p-4 sm:p-5 lg:col-span-4`}>
                    {statusDonut.length > 0 ? (
                      <DonutChart
                        data={statusDonut}
                        height={200}
                        centerValue={students.length}
                        centerLabel="Students"
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground py-10 text-center">No student status data.</p>
                    )}
                  </div>
                  <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Tile
                      value={analytics.currentActive}
                      label="Current (active)"
                      tone="good"
                      sub="Active, not withdrawn"
                      onClick={() => { setRole('student'); setFlag(null); setTab('people'); }}
                    />
                    <Tile
                      value={analytics.withdrawnCount}
                      label="Withdrawn / ended"
                      tone="bad"
                      active={flag === 'withdrawn'}
                      onClick={() => focusFlag(flag === 'withdrawn' ? null : 'withdrawn')}
                      sub="Left or ended enrolment"
                    />
                    <Tile
                      value={exceptionTotals?.displaced ?? analytics.displacedCount}
                      label="Displaced (no roster)"
                      tone="warn"
                      onClick={() => { window.location.href = ACADEMIC_EXCEPTIONS_HREF; }}
                      sub="Resolve in Academic Office →"
                    />
                    <Tile
                      value={exceptionTotals?.placeholder_noise ?? 0}
                      label="Placeholder noise"
                      tone="bad"
                      onClick={() => { window.location.href = ACADEMIC_EXCEPTIONS_HREF; }}
                      sub="Dry-run & hard purge in Academic Office"
                    />
                    <Tile
                      value={exceptionTotals?.hollow_shell ?? 0}
                      label="Hollow shells"
                      tone="bad"
                      onClick={() => { window.location.href = ACADEMIC_EXCEPTIONS_HREF; }}
                      sub="Old empty accounts — purge queue"
                    />
                    <Tile
                      value={analytics.mismatchCount}
                      label="Class mismatch"
                      tone="warn"
                      active={flag === 'class_mismatch'}
                      onClick={() => focusFlag(flag === 'class_mismatch' ? null : 'class_mismatch')}
                      sub="Profile class ≠ roster class"
                    />
                    <Tile
                      value={analytics.classCount}
                      label="Classes tracked"
                      sub={`${analytics.classesWithMissing} with missing results`}
                      onClick={() => setTab('reports')}
                    />
                    <Tile
                      value={analytics.placedOnRoster}
                      label="On roster"
                      tone="good"
                      sub={`${analytics.placedPct}% of students`}
                      onClick={() => { setRole('student'); setFlag(null); setTab('people'); }}
                    />
                  </div>
                </div>
              </Section>

              <Section title="Integrity charts (active term)" icon={<ChartBarIcon className="w-3.5 h-3.5" />}>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  <div className={`${CARD} p-5 space-y-3`}>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold uppercase tracking-wider">Report publication</span>
                      <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">{analytics.publishedPct}%</span>
                    </div>
                    <div className="h-3 w-full bg-muted rounded-full overflow-hidden flex">
                      <div style={{ width: `${analytics.publishedPct}%` }} className="bg-emerald-500 h-full" />
                      <div style={{ width: `${analytics.draftPct}%` }} className="bg-amber-500 h-full" />
                    </div>
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>{analytics.publishedReports} published</span>
                      <span className="text-amber-600 dark:text-amber-400 font-bold">{analytics.draftReports} drafts</span>
                    </div>
                  </div>
                  <div className={`${CARD} p-5 space-y-3`}>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold uppercase tracking-wider">Roster placement</span>
                      <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">{analytics.placedPct}%</span>
                    </div>
                    <div className="h-3 w-full bg-muted rounded-full overflow-hidden flex">
                      <div style={{ width: `${analytics.placedPct}%` }} className="bg-emerald-500 h-full" />
                      <div style={{ width: `${100 - analytics.placedPct}%` }} className="bg-rose-500/80 h-full" />
                    </div>
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>{analytics.placedOnRoster} on roster</span>
                      <span className="text-rose-600 dark:text-rose-400 font-bold">{analytics.unplaced} unplaced</span>
                    </div>
                  </div>
                  <div className={`${CARD} p-5 space-y-3`}>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold uppercase tracking-wider">Parent email reach</span>
                      <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">{analytics.parentEmailReachPct}%</span>
                    </div>
                    <div className="h-3 w-full bg-muted rounded-full overflow-hidden flex">
                      <div style={{ width: `${analytics.parentEmailReachPct}%` }} className="bg-indigo-500 h-full" />
                      <div style={{ width: `${100 - analytics.parentEmailReachPct}%` }} className="bg-amber-500 h-full" />
                    </div>
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>{analytics.parentEmailMatched} linked</span>
                      <Link href="/dashboard/parents" className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-1">
                        <UserPlusIcon className="w-3 h-3" /> Manage
                      </Link>
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="What is missing (active term)" icon={<ExclamationTriangleIcon className="w-3.5 h-3.5" />}>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {Object.entries(flagCounts).sort((a, b) => b[1] - a[1]).map(([f, n]) => (
                    <Tile
                      key={f}
                      value={n}
                      label={FLAG_LABEL[f] ?? f}
                      tone={n >= studentCount * 0.1 ? 'bad' : 'warn'}
                      active={flag === f}
                      onClick={() => focusFlag(flag === f ? null : f)}
                    />
                  ))}
                  {Object.keys(flagCounts).length === 0 && (
                    <div className={`${CARD} p-5 text-sm text-emerald-600 dark:text-emerald-400 font-bold col-span-full`}>No census flags — clean snapshot.</div>
                  )}
                </div>
              </Section>

              <div className={`${CARD} p-4 sm:p-5 bg-indigo-500/5 border-indigo-500/20 flex items-start gap-3`}>
                <InformationCircleIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <h3 className="font-bold text-foreground">How to read this census</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Every row is labelled by its real portal role. Teachers never appear as students.
                    Student-only gaps (roster, parent contact, reports) only apply to student accounts.
                    Report metrics are scoped to the <strong>active academic term</strong>; older unpublished work is under Reports &amp; the Full Report PDF.
                  </p>
                </div>
              </div>
            </>
          )}

          {/* ── PEOPLE ───────────────────────────────────────────── */}
          {tab === 'people' && (
            <Section
              title={`${filtered.length} account${filtered.length === 1 ? '' : 's'}${role ? ` · ${roleMeta(role).label}` : ''}${flag ? ` · ${FLAG_LABEL[flag] ?? flag}` : ''}`}
              icon={<BuildingOfficeIcon className="w-3.5 h-3.5" />}
              action={
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                  <input
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    placeholder="Search name, email, school, role…"
                    className="w-full sm:w-56 bg-card border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-500"
                  />
                  <select value={role || ''} onChange={(e) => { setRole(e.target.value || null); setPage(1); }} className="bg-card border border-border rounded-xl px-3 py-2 text-sm">
                    <option value="">All roles</option>
                    {Object.keys(roleCounts).sort().map((r) => (
                      <option key={r} value={r}>{roleMeta(r).label} ({roleCounts[r]})</option>
                    ))}
                  </select>
                  <select value={school} onChange={(e) => { setSchool(e.target.value); setPage(1); }} className="bg-card border border-border rounded-xl px-3 py-2 text-sm max-w-[12rem]">
                    <option value="">All schools</option>
                    {schools.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select value={peopleSort} onChange={(e) => setPeopleSort(e.target.value as typeof peopleSort)} className="bg-card border border-border rounded-xl px-3 py-2 text-sm">
                    <option value="role">Sort: Role</option>
                    <option value="name">Sort: Name</option>
                    <option value="school">Sort: School</option>
                  </select>
                  {(flag || role || school || search) && (
                    <button type="button" onClick={clearFilters} className="rounded-xl border border-border px-3 py-2 text-xs font-black uppercase tracking-wider text-muted-foreground hover:bg-accent">Clear</button>
                  )}
                  <button type="button" onClick={() => downloadPeopleCsv(filtered)} disabled={!filtered.length} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-black uppercase tracking-wider hover:bg-accent disabled:opacity-40">
                    <ArrowDownTrayIcon className="w-3.5 h-3.5" /> CSV
                  </button>
                </div>
              }
            >
              {selectedIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs">
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">{selectedIds.size} selected</span>
                  <button type="button" onClick={() => setReachOutModalOpen(true)} className="font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 hover:underline">Batch reach-out</button>
                  <button type="button" onClick={() => setSelectedIds(new Set())} className="text-muted-foreground hover:underline">Clear selection</button>
                </div>
              )}

              <div className={`${CARD} overflow-x-auto`}>
                <table className="w-full text-sm min-w-[860px]">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-3 py-3 w-10 text-center">
                        <input type="checkbox" checked={allPaginatedSelected} onChange={toggleSelectAll} className="rounded border-border text-indigo-600 dark:text-indigo-400" />
                      </th>
                      {['Person', 'Role', 'School / placement', 'Reports', 'Flags', 'Actions'].map((h) => (
                        <th key={h} className={`${LABEL} px-3 py-3 whitespace-nowrap`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginatedPeople.map((p) => {
                      const student = isStudent(p);
                      const teacher = isTeacher(p);
                      return (
                        <tr key={p.id} className={`hover:bg-accent/40 ${selectedIds.has(p.id) ? 'bg-indigo-500/5' : ''}`}>
                          <td className="px-3 py-2.5 text-center">
                            <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} className="rounded border-border text-indigo-600 dark:text-indigo-400" />
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-bold text-foreground">{p.full_name || '(no name)'}</div>
                            <div className="text-xs text-muted-foreground">{p.email || '—'}</div>
                            {p.enrollment_type && student && (
                              <div className="text-[10px] text-muted-foreground mt-0.5">Enrolment: {p.enrollment_type}</div>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <RoleBadge role={p.role} size="sm" />
                            {!p.is_active && <div className="text-[10px] text-rose-600 dark:text-rose-400 font-bold mt-1">INACTIVE</div>}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground">
                            <div>{p.school_name || '—'}</div>
                            {student ? (
                              <div className="text-xs mt-0.5">
                                {p.class_from_roster || <span className="text-rose-600 dark:text-rose-400 font-bold">not on roster</span>}
                                {p.class_on_profile && p.class_from_roster && p.class_on_profile !== p.class_from_roster && (
                                  <div className="text-amber-600 dark:text-amber-400">Profile: {p.class_on_profile}</div>
                                )}
                              </div>
                            ) : teacher ? (
                              <div className="text-xs mt-0.5 text-violet-600 dark:text-violet-400 font-semibold">Teaching staff</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                            {p.reports_total === 0 ? '—' : (
                              <>
                                {p.reports_published} pub
                                {p.reports_draft > 0 && <span className="text-amber-600 dark:text-amber-400"> · {p.reports_draft} draft</span>}
                              </>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap gap-1 max-w-[16rem]">
                              {(p.flags ?? []).length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                              {(p.flags ?? []).map((f) => (
                                <span key={f} title={FLAG_LABEL[f]} className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${f === 'withdrawn' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'bg-muted text-muted-foreground'}`}>
                                  {f.replace(/_/g, ' ')}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <div className="flex flex-wrap gap-2">
                              {student && (
                                <button type="button" onClick={() => openReachOut(p)} className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                                  <PaperAirplaneIcon className="w-3.5 h-3.5" /> Reach parent
                                </button>
                              )}
                              {student && ((p.flags ?? []).includes('no_parent_email') || (p.flags ?? []).includes('no_parent_phone')) && (
                                <Link href="/dashboard/parents" className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline">
                                  <LinkIcon className="w-3 h-3" /> Link parent
                                </Link>
                              )}
                              {student && (p.flags ?? []).includes('no_class') && (
                                <Link href="/dashboard/classes" className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline">
                                  <LinkIcon className="w-3 h-3" /> Assign roster
                                </Link>
                              )}
                              {teacher && (
                                <button type="button" onClick={() => setTab('teachers')} className="text-xs font-bold text-violet-600 dark:text-violet-400 hover:underline">
                                  View teachers
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-border">
                  <div className="text-xs text-muted-foreground">
                    Showing <strong className="text-foreground">{totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1}</strong>–
                    <strong className="text-foreground">{Math.min(currentPage * pageSize, totalItems)}</strong> of{' '}
                    <strong className="text-foreground">{totalItems}</strong>
                    <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="ml-2 bg-card border border-border rounded-md px-2 py-1 text-xs">
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={250}>250</option>
                      <option value={10000}>All</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold disabled:opacity-40">Prev</button>
                    <span className="text-xs font-bold">Page {currentPage}/{totalPages}</span>
                    <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold disabled:opacity-40">Next</button>
                  </div>
                </div>
                {filtered.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nobody matches that filter.</p>
                )}
              </div>
            </Section>
          )}

          {/* ── TEACHERS ─────────────────────────────────────────── */}
          {tab === 'teachers' && <TeacherAccountabilityPanel />}

          {/* ── REPORTS ──────────────────────────────────────────── */}
          {tab === 'reports' && (
            <>
              <Section title="Reports (active term)" icon={<ClipboardDocumentListIcon className="w-3.5 h-3.5" />}>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <Tile value={c?.totals.reports ?? 0} label="Reports written" />
                  <Tile value={c?.totals.published ?? 0} label="Published" tone="good" />
                  <Tile value={c?.totals.draft ?? 0} label="Unpublished draft" tone="warn" onClick={() => focusFlag('draft_pending')} />
                  <Tile value={c?.gaps.reports_missing_course ?? 0} label="Missing course link" tone="warn" />
                  <Tile value={c?.totals.students_with_report ?? 0} label="Students with a report" />
                  <Tile value={c?.totals.students_on_roster ?? 0} label="Students on roster" />
                </div>
              </Section>

              {classChartData.length > 0 && (
                <div className={`${CARD} p-4 sm:p-5`}>
                  <h3 className={`${LABEL} mb-2`}>Class coverage — published / draft / missing</h3>
                  <StackedBarChart
                    data={classChartData}
                    xKey="class"
                    height={280}
                    bars={[
                      { key: 'published', label: 'Published', color: CHART_COLORS.emerald },
                      { key: 'draft', label: 'Draft', color: CHART_COLORS.amber },
                      { key: 'missing', label: 'Missing', color: CHART_COLORS.rose },
                    ]}
                  />
                </div>
              )}

              {c && c.classes_without_reports.length > 0 && (
                <Section title="Classes with pupils but zero reports" icon={<ExclamationTriangleIcon className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />}>
                  <div className={`${CARD} divide-y divide-border`}>
                    {c.classes_without_reports.map((x) => (
                      <div key={x.class} className="flex items-center justify-between px-4 py-3 gap-3">
                        <span className="text-sm font-bold text-foreground">{x.class}</span>
                        <span className="text-sm font-black text-rose-600 dark:text-rose-400">{x.students} pupils · 0 reports</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {c && c.by_class.length > 0 && (
                <Section title="Coverage by class" icon={<AcademicCapIcon className="w-3.5 h-3.5" />}>
                  <div className={`${CARD} overflow-x-auto`}>
                    <table className="w-full text-sm min-w-[720px]">
                      <thead>
                        <tr className="border-b border-border text-left">
                          {['Class', 'Students', 'Reports', 'Published', 'Drafts', 'Missing', 'Progress'].map((h) => (
                            <th key={h} className={`${LABEL} px-3 py-3`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {c.by_class.map((row: ClassRow, idx) => {
                          const pct = row.students > 0 ? Math.round((row.published / row.students) * 100) : 0;
                          const missing = row.missing ?? Math.max(0, row.students - (row.published + row.draft));
                          return (
                            <tr key={`${row.class}-${idx}`} className="hover:bg-accent/40">
                              <td className="px-3 py-2.5 font-bold">{row.class}</td>
                              <td className="px-3 py-2.5 text-muted-foreground">{row.students}</td>
                              <td className="px-3 py-2.5 text-muted-foreground">{row.reports}</td>
                              <td className="px-3 py-2.5">{row.published}</td>
                              <td className="px-3 py-2.5">{row.draft > 0 ? <span className="text-amber-600 dark:text-amber-400 font-bold">{row.draft}</span> : '—'}</td>
                              <td className="px-3 py-2.5">
                                {missing > 0
                                  ? <span className="text-xs font-black text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">{missing} missing</span>
                                  : <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">0 missing</span>}
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-2 justify-end">
                                  <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                                    <div style={{ width: `${Math.min(100, pct)}%` }} className={`h-full ${pct === 100 ? 'bg-emerald-500' : pct > 50 ? 'bg-indigo-500' : 'bg-amber-500'}`} />
                                  </div>
                                  <span className="text-xs font-bold w-9 text-right">{pct}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Section>
              )}

              {backlog && backlog.hidden_by_term_filter.drafts > 0 && (
                <Section title="Overdue backlog — hidden by active-term filter" icon={<ExclamationTriangleIcon className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />}>
                  <div className={`${CARD} p-4 text-sm text-muted-foreground`}>
                    Across all terms there are <strong className="text-foreground">{backlog.all_terms.drafts}</strong> unpublished reports —
                    so <strong className="text-rose-600 dark:text-rose-400">{backlog.hidden_by_term_filter.drafts}</strong> drafts sit outside this term view.
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Tile value={backlog.all_terms.reports} label="Reports · all terms" />
                    <Tile value={backlog.current_term.reports} label="Reports · active term" />
                    <Tile value={backlog.all_terms.drafts} label="Unpublished · all terms" tone="warn" />
                    <Tile value={backlog.hidden_by_term_filter.drafts} label="Unpublished · hidden here" tone="bad" />
                  </div>
                  {backlog.overdue_by_teacher.length > 0 && (
                    <div className={`${CARD} overflow-x-auto`}>
                      <table className="w-full text-sm min-w-[640px]">
                        <thead>
                          <tr className="border-b border-border text-left">
                            {['Teacher', 'Course', 'Term', 'Unpublished', 'Oldest'].map((h) => (
                              <th key={h} className={`${LABEL} px-3 py-3`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {backlog.overdue_by_teacher.map((o, i) => (
                            <tr key={i} className="hover:bg-accent/40">
                              <td className="px-3 py-2.5 font-bold">{o.teacher}</td>
                              <td className="px-3 py-2.5 text-muted-foreground">{o.course || '—'}</td>
                              <td className="px-3 py-2.5 text-muted-foreground">{o.term}</td>
                              <td className="px-3 py-2.5 font-black text-rose-600 dark:text-rose-400">{o.drafts}</td>
                              <td className="px-3 py-2.5">{o.oldest_days == null ? '—' : <span className={o.oldest_days >= 60 ? 'font-black text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}>{o.oldest_days} days</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Section>
              )}

              <Section title="Students at risk" icon={<ExclamationTriangleIcon className="w-3.5 h-3.5" />}>
                <AtRiskList schoolId={undefined} />
              </Section>

              {c && c.possible_duplicate_classes.length > 0 && (
                <Section title="Classes that look duplicated">
                  <div className={`${CARD} divide-y divide-border`}>
                    {c.possible_duplicate_classes.map((d, i) => (
                      <div key={i} className="px-4 py-3 text-sm">{d.names.map((n) => `"${n}"`).join('  vs  ')}</div>
                    ))}
                  </div>
                </Section>
              )}
            </>
          )}

          {/* ── COMMS ────────────────────────────────────────────── */}
          {tab === 'comms' && (
            <>
              <Section title="Parent-student contact reachability" icon={<EnvelopeIcon className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className={`${CARD} p-5 space-y-1`}>
                    <div className="flex justify-between"><span className="text-xs font-bold flex items-center gap-1"><EnvelopeIcon className="w-3.5 h-3.5" /> Parent email</span><span className="text-xs font-black text-indigo-600 dark:text-indigo-400">{analytics.parentEmailReachPct}%</span></div>
                    <div className="text-3xl font-black">{analytics.parentEmailMatched}</div>
                    <p className="text-[11px] text-muted-foreground">Students with parent email on file</p>
                  </div>
                  <div className={`${CARD} p-5 space-y-1`}>
                    <div className="flex justify-between"><span className="text-xs font-bold flex items-center gap-1"><PhoneIcon className="w-3.5 h-3.5" /> Parent phone</span><span className="text-xs font-black text-indigo-600 dark:text-indigo-400">{analytics.parentPhoneReachPct}%</span></div>
                    <div className="text-3xl font-black">{analytics.parentPhoneMatched}</div>
                    <p className="text-[11px] text-muted-foreground">Students with parent phone on file</p>
                  </div>
                  <div className={`${CARD} p-5 space-y-1`}>
                    <div className="flex justify-between"><span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircleIcon className="w-3.5 h-3.5" /> Fully matched</span><span className="text-xs font-black text-emerald-600 dark:text-emerald-400">{analytics.parentFullyMatchedPct}%</span></div>
                    <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{analytics.parentFullyMatched}</div>
                    <p className="text-[11px] text-muted-foreground">Both email & phone attached</p>
                  </div>
                  <div className={`${CARD} p-5 space-y-1`}>
                    <div className="flex justify-between"><span className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1"><ExclamationTriangleIcon className="w-3.5 h-3.5" /> Unmatched</span><span className="text-xs font-black text-rose-600 dark:text-rose-400">{analytics.parentUnmatched}</span></div>
                    <div className="text-3xl font-black text-rose-600 dark:text-rose-400">{analytics.parentUnmatched}</div>
                    <p className="text-[11px] text-muted-foreground">Zero parent contact details</p>
                  </div>
                </div>
              </Section>

              {c?.by_provider && c.by_provider.length > 0 && (
                <Section title="Email providers (Resend / SendPulse)" icon={<PaperAirplaneIcon className="w-3.5 h-3.5" />}>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {c.by_provider.map((prov, idx) => {
                      const pct = prov.total_dispatched > 0 ? Math.round((prov.delivered / prov.total_dispatched) * 100) : 0;
                      return (
                        <div key={idx} className={`${CARD} p-5 space-y-2`}>
                          <div className="flex justify-between">
                            <span className="text-xs font-bold capitalize">{prov.provider}</span>
                            <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">{pct}% delivered</span>
                          </div>
                          <div className="text-3xl font-black">{prov.total_dispatched}</div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden"><div style={{ width: `${pct}%` }} className="h-full bg-emerald-500" /></div>
                          <div className="flex justify-between text-[11px]">
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{prov.delivered} delivered</span>
                            <span className={prov.failed_or_bounced ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-muted-foreground'}>{prov.failed_or_bounced} bounced</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              )}

              {c?.by_email_type && c.by_email_type.length > 0 && (
                <Section title="Dispatches by category" icon={<EnvelopeIcon className="w-3.5 h-3.5" />}>
                  <div className={`${CARD} overflow-x-auto`}>
                    <table className="w-full text-sm min-w-[720px]">
                      <thead>
                        <tr className="border-b border-border text-left">
                          {['Category', 'Provider', 'Dispatched', 'Delivered', 'Failed', 'Pending', 'Rate'].map((h) => (
                            <th key={h} className={`${LABEL} px-3 py-3`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {c.by_email_type.map((em, idx) => {
                          const pct = em.total_dispatched > 0 ? Math.round((em.delivered / em.total_dispatched) * 100) : 0;
                          return (
                            <tr key={idx} className="hover:bg-accent/40">
                              <td className="px-3 py-2.5 font-bold capitalize">{em.email_type.replace(/_/g, ' ')}</td>
                              <td className="px-3 py-2.5 capitalize text-muted-foreground">{em.provider || '—'}</td>
                              <td className="px-3 py-2.5">{em.total_dispatched}</td>
                              <td className="px-3 py-2.5 text-emerald-600 dark:text-emerald-400 font-bold">{em.delivered}</td>
                              <td className="px-3 py-2.5">{em.failed_or_bounced > 0 ? <span className="text-rose-600 dark:text-rose-400 font-bold">{em.failed_or_bounced}</span> : '0'}</td>
                              <td className="px-3 py-2.5 text-muted-foreground">{em.pending}</td>
                              <td className="px-3 py-2.5 text-right">
                                <div className="inline-flex items-center gap-2">
                                  <div className="w-16 h-2 bg-muted rounded-full overflow-hidden"><div style={{ width: `${pct}%` }} className={`h-full ${pct >= 90 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`} /></div>
                                  <span className="text-xs font-bold w-9">{pct}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Section>
              )}

              {(!c?.by_provider?.length && !c?.by_email_type?.length) && (
                <div className={`${CARD} p-8 text-center text-sm text-muted-foreground`}>
                  No email delivery stats in this snapshot yet. Send via Template Machine or wait for trigger emails to populate the log.
                </div>
              )}
            </>
          )}

          {/* ── FULL REPORT ──────────────────────────────────────── */}
          {tab === 'report' && (
            <Section title="Concrete accountability report" icon={<ArrowDownTrayIcon className="w-3.5 h-3.5" />}>
              <div className={`${CARD} p-5 sm:p-6 space-y-5`}>
                <div>
                  <h3 className="text-lg font-black text-foreground">Download a full written census</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                    Generates a multi-section PDF: role breakdown, headline metrics, gaps, teacher performance,
                    class coverage, cross-term backlog, complete teacher directory, and students with critical gaps.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Tile value={people.length} label="Accounts included" />
                  <Tile value={teachers.length} label="Teachers listed" />
                  <Tile value={students.length} label="Students listed" />
                  <Tile value={`${analytics.healthScore}%`} label="Health score" tone={analytics.healthScore >= 85 ? 'good' : analytics.healthScore >= 70 ? 'warn' : 'bad'} />
                </div>

                <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4">
                  <li>Who is on the platform (every role, with definitions)</li>
                  <li>Headline metrics for the active term</li>
                  <li>Gaps &amp; flags</li>
                  <li>Teacher report performance</li>
                  <li>Class coverage table</li>
                  <li>Cross-term unpublished backlog (when present)</li>
                  <li>Full teacher directory (teachers as teachers)</li>
                  <li>Students with critical gaps</li>
                </ol>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleGeneratePdf}
                    disabled={reportBusy || people.length === 0}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 text-white px-4 py-2.5 text-xs font-black uppercase tracking-wider hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <ArrowDownTrayIcon className={`w-4 h-4 ${reportBusy ? 'animate-pulse' : ''}`} />
                    {reportBusy ? 'Building PDF…' : 'Generate PDF report'}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadPeopleCsv(people, 'accountability-full-census.csv')}
                    disabled={people.length === 0}
                    className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-xs font-black uppercase tracking-wider hover:bg-accent disabled:opacity-50"
                  >
                    <ArrowDownTrayIcon className="w-4 h-4" /> Export full census CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadPeopleCsv(teachers, 'accountability-teachers.csv')}
                    disabled={teachers.length === 0}
                    className="inline-flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400 px-4 py-2.5 text-xs font-black uppercase tracking-wider disabled:opacity-50"
                  >
                    Export teachers CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadPeopleCsv(students, 'accountability-students.csv')}
                    disabled={students.length === 0}
                    className="inline-flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400 px-4 py-2.5 text-xs font-black uppercase tracking-wider disabled:opacity-50"
                  >
                    Export students CSV
                  </button>
                </div>

                {reportMsg && (
                  <p className={`text-sm font-bold ${reportMsg.startsWith('Error') ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{reportMsg}</p>
                )}
              </div>

              {/* Printable on-screen summary */}
              <div className={`${CARD} p-5 sm:p-6 space-y-4 print:shadow-none`} id="accountability-print-summary">
                <h3 className="font-black text-foreground">On-screen executive summary</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-2">
                    <p className={LABEL}>Role census</p>
                    {Object.entries(roleCounts).sort((a, b) => b[1] - a[1]).map(([r, n]) => (
                      <div key={r} className="flex items-center justify-between gap-2 border-b border-border/60 py-1.5">
                        <RoleBadge role={r} size="sm" />
                        <span className="font-black tabular-nums">{n}</span>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <p className={LABEL}>Active term snapshot</p>
                    {[
                      ['Health score', `${analytics.healthScore}%`],
                      ['Students on roster', `${analytics.placedOnRoster} (${analytics.placedPct}%)`],
                      ['Reports published', `${analytics.publishedReports} (${analytics.publishedPct}%)`],
                      ['Parent email linked', `${analytics.parentEmailMatched} (${analytics.parentEmailReachPct}%)`],
                      ['Parent phone linked', `${analytics.parentPhoneMatched} (${analytics.parentPhoneReachPct}%)`],
                      ['Unplaced students', String(analytics.unplaced)],
                      ['Draft reports', String(analytics.draftReports)],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between border-b border-border/60 py-1.5">
                        <span className="text-muted-foreground">{k}</span>
                        <span className="font-black tabular-nums">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {classChartData.length > 0 && (
                  <div>
                    <p className={`${LABEL} mb-2`}>Class publication (top classes)</p>
                    <VerticalBarChart
                      data={classChartData}
                      xKey="class"
                      height={240}
                      bars={[
                        { key: 'published', label: 'Published', color: CHART_COLORS.emerald },
                        { key: 'draft', label: 'Draft', color: CHART_COLORS.amber },
                      ]}
                    />
                  </div>
                )}
              </div>
            </Section>
          )}

          {c && (
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <p className="text-xs text-muted-foreground">Snapshot taken {fmtDate(c.generated_at)}</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Cache live
              </span>
            </div>
          )}
        </div>
      )}

      <ParentReachOutModal
        isOpen={reachOutModalOpen}
        onClose={() => setReachOutModalOpen(false)}
        initialPerson={reachOutPerson}
        recipients={selectedPeopleTargets}
        onSuccess={() => {
          setSelectedIds(new Set());
          onRefresh(true);
        }}
      />
    </div>
  );
}
