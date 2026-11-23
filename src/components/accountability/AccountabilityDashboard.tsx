'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AcademicCapIcon, ArrowDownTrayIcon, ArrowPathIcon, BuildingOfficeIcon,
  ChartBarIcon, CheckCircleIcon, ClipboardDocumentListIcon, CogIcon,
  EnvelopeIcon, ExclamationTriangleIcon, LinkIcon,
  PaperAirplaneIcon, PhoneIcon, ShieldCheckIcon, UserGroupIcon, UserIcon,
} from '@/lib/icons';
import {
  CHART_COLORS, DonutChart, StackedBarChart, VerticalBarChart,
} from '@/components/charts';
import { RoleBadge } from '@/components/accountability/RoleBadge';
import ParentReachOutModal, { ReachOutPersonTarget } from '@/components/accountability/ParentReachOutModal';
import QuickClassPlacementModal from '@/components/accountability/QuickClassPlacementModal';
import TeacherAccountabilityPanel from '@/components/accountability/TeacherAccountabilityPanel';
import { AtRiskList } from '@/components/analytics/AtRiskList';
import {
  AccountabilityTab, Backlog, ClassRow, Coverage, FLAG_LABEL, Person,
  SchoolAccountabilityRow, fmtDate, isStudent, isTeacher, normalizeRole, roleMeta,
} from '@/lib/accountability/types';
import { computeAccountabilityMetrics, downloadPeopleCsv, generateAccountabilityPdf } from '@/lib/accountability/report';
import MobilePageHero from '@/components/mobile/MobilePageHero';
import MobileScrollStrip from '@/components/mobile/MobileScrollStrip';
import { MOBILE_PAGE_BOTTOM, MOBILE_TOUCH_BTN } from '@/components/mobile/mobile-styles';

const CARD = 'bg-card shadow-sm border border-border rounded-2xl';
const LABEL = 'text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground';

const TABS: { id: AccountabilityTab; label: string; hint: string }[] = [
  { id: 'overview', label: 'Overview', hint: 'Health & action queue' },
  { id: 'schools', label: 'Schools', hint: 'Every school scorecard' },
  { id: 'people', label: 'Directory', hint: 'All accounts & flags' },
  { id: 'teachers', label: 'Teachers', hint: 'Activity & reports' },
  { id: 'reports', label: 'Classes & Reports', hint: 'Coverage by class' },
  { id: 'comms', label: 'Parent Reach', hint: 'Contacts & emails' },
  { id: 'report', label: 'Export', hint: 'PDF & CSV reports' },
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
      className={`${CARD} p-4 sm:p-5 text-left transition-all w-full ${onClick ? 'hover:border-primary/50 cursor-pointer' : 'cursor-default'} ${active ? 'border-primary ring-1 ring-primary/40' : ''}`}
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
  schoolsSummary?: SchoolAccountabilityRow[];
  backlog: Backlog | null;
  census?: {
    total: number;
    by_role: Record<string, number>;
    live_total: number | null;
    live_by_role: Record<string, number> | null;
    source: string;
  } | null;
  exceptionTotals?: Partial<Record<'displaced' | 'hollow_shell' | 'placeholder_noise' | 'withdrawn_active' | 'class_mismatch' | 'missing_parent_contact', number>>;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  dataQualityWarnings: string[];
  syncFeedback: string | null;
  syncingClasses: boolean;
  pollInterval: number;
  setPollInterval: (n: number) => void;
  onRefresh: (force?: boolean) => void;
  onSyncClasses: () => void;
  autoClassRepairEnabled?: boolean;
  generatedBy?: string;
};

const ACADEMIC_EXCEPTIONS_HREF = '/dashboard/academic#academic-exceptions';

export default function AccountabilityDashboard({
  coverage: c,
  people: rawPeople,
  schoolsSummary = [],
  backlog,
  census,
  exceptionTotals,
  loading,
  refreshing,
  error,
  dataQualityWarnings,
  syncFeedback,
  syncingClasses,
  pollInterval,
  setPollInterval,
  onRefresh,
  onSyncClasses,
  autoClassRepairEnabled = false,
  generatedBy,
}: Props) {
  const [tab, setTab] = useState<AccountabilityTab>('overview');
  const [sessionScope, setSessionScope] = useState<'current' | 'archive' | 'all'>('current');
  const [schoolSearch, setSchoolSearch] = useState('');
  const [reachOutModalOpen, setReachOutModalOpen] = useState(false);

  // Clean separation of concerns: keep Current Session operations cleanly separated
  // from Prior Session / Withdrawn / Archive records so old sessions never distort live KPIs.
  const sessionCounts = useMemo(() => {
    let current = 0;
    let archive = 0;
    for (const p of rawPeople) {
      if (p.session_scope === 'archive') archive += 1;
      else current += 1;
    }
    return { current, archive, all: rawPeople.length };
  }, [rawPeople]);

  const people = useMemo(() => {
    if (sessionScope === 'all') return rawPeople;
    if (sessionScope === 'archive') return rawPeople.filter((p) => p.session_scope === 'archive');
    return rawPeople.filter((p) => p.session_scope !== 'archive');
  }, [rawPeople, sessionScope]);

  const filteredSchoolsSummary = useMemo(() => {
    const q = schoolSearch.trim().toLowerCase();
    const list = q
      ? schoolsSummary.filter((s) =>
          `${s.name} ${s.city ?? ''} ${s.state ?? ''} ${s.status ?? ''}`.toLowerCase().includes(q),
        )
      : schoolsSummary;
    return [...list].sort((a, b) => b.students_total - a.students_total || a.name.localeCompare(b.name));
  }, [schoolsSummary, schoolSearch]);
  const [reachOutPerson, setReachOutPerson] = useState<Person | null>(null);
  const [placementTargets, setPlacementTargets] = useState<Person[]>([]);
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
  const gapPeople = useMemo(() => people.filter((p) => (p.flags ?? []).length > 0), [people]);

  const schools = useMemo(
    () => Array.from(new Set([
      ...schoolsSummary.map((s) => s.name),
      ...(rawPeople.map((p) => p.school_name).filter(Boolean) as string[]),
    ])).sort(),
    [schoolsSummary, rawPeople],
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

  const analytics = useMemo(() => {
    const m = computeAccountabilityMetrics(c, people, sessionScope !== 'all');
    const scopedStudents = people.filter(isStudent);
    const parentFullyMatched = sessionScope !== 'all'
      ? scopedStudents.filter((p) => Boolean(p.has_parent_email) && Boolean(p.has_parent_contact)).length
      : (c?.totals.parent_fully_matched ?? 0);
    const parentUnmatched = sessionScope !== 'all'
      ? scopedStudents.filter((p) => !p.has_parent_email && !p.has_parent_contact).length
      : (c?.totals.parent_unmatched ?? 0);
    const parentFullyMatchedPct = m.totalStudents > 0
      ? Math.round((parentFullyMatched / Math.max(m.totalStudents, 1)) * 100)
      : 0;
    const withdrawnCount = c?.totals.withdrawn_students || flagCounts.withdrawn || 0;
    const mismatchCount = flagCounts.class_mismatch || 0;
    const classCount = c?.by_class?.length || 0;
    const classesWithMissing = (c?.by_class ?? []).filter((row) => {
      const missing = row.missing ?? Math.max(0, row.students - (row.published + row.draft));
      return missing > 0;
    }).length;
    return {
      placedPct: m.placedPct,
      placedOnRoster: m.placed,
      unplaced: m.unplaced,
      totalStudents: m.totalStudents,
      publishedReports: m.published,
      draftReports: m.drafts,
      publishedPct: m.publishedPct,
      draftPct: m.draftPct,
      parentEmailMatched: m.parentEmail,
      parentPhoneMatched: m.parentPhone,
      parentFullyMatched,
      parentUnmatched,
      parentEmailReachPct: m.emailPct,
      parentPhoneReachPct: m.phonePct,
      parentFullyMatchedPct,
      noParentEmailCount: flagCounts.no_parent_email || 0,
      noParentPhoneCount: flagCounts.no_parent_phone || 0,
      withdrawnCount,
      mismatchCount,
      classCount,
      classesWithMissing,
      healthScore: m.health,
    };
  }, [c, people, flagCounts]);

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
        schoolsSummary,
        sessionScope,
        backlog,
        generatedBy,
      });
      setReportMsg('Official Rillcod Technologies PDF report downloaded.');
    } catch (e) {
      setReportMsg(`Error: ${e instanceof Error ? e.message : 'Could not generate PDF'}`);
    } finally {
      setReportBusy(false);
    }
  };

  const actionQueueItems = useMemo(() => {
    return [
      {
        key: 'no_class',
        count: exceptionTotals?.displaced ?? analytics.unplaced,
        title: 'Students not placed in an active class',
        desc: 'Place them into a class so they can access lessons, CBT exams, and progress reports.',
        cta: 'Review List',
        onClick: () => focusFlag('no_class'),
        tone: 'rose' as const,
      },
      {
        key: 'class_mismatch',
        count: analytics.mismatchCount,
        title: 'Account class does not match term roster',
        desc: `Automatic class repair is ${autoClassRepairEnabled ? 'enabled' : 'manual'}. Sync now to align profiles.`,
        cta: syncingClasses ? 'Syncing…' : 'Fix Wrong Classes',
        onClick: () => onSyncClasses(),
        tone: 'amber' as const,
      },
      {
        key: 'draft_pending',
        count: analytics.draftReports,
        title: 'Progress reports stuck in draft',
        desc: 'Written by teachers but not yet published to parents and students.',
        cta: 'View Drafts',
        onClick: () => focusFlag('draft_pending'),
        tone: 'amber' as const,
      },
      {
        key: 'no_parent_email',
        count: analytics.noParentEmailCount,
        title: 'Students missing parent email',
        desc: 'Parents will not receive report alerts until an email address is linked.',
        cta: 'View Students',
        onClick: () => focusFlag('no_parent_email'),
        tone: 'amber' as const,
      },
      {
        key: 'no_parent_phone',
        count: analytics.noParentPhoneCount,
        title: 'Students missing parent phone',
        desc: 'Add guardian phone numbers for WhatsApp and SMS reachability.',
        cta: 'View Students',
        onClick: () => focusFlag('no_parent_phone'),
        tone: 'amber' as const,
      },
      {
        key: 'cleanup',
        count: (exceptionTotals?.placeholder_noise ?? 0) + (exceptionTotals?.hollow_shell ?? 0),
        title: 'Test / junk or empty shell accounts',
        desc: 'Safe to archive or clean up inside Academic Office Exceptions.',
        cta: 'Open Cleanup',
        href: ACADEMIC_EXCEPTIONS_HREF,
        tone: 'rose' as const,
      },
    ].filter((item) => item.count > 0);
  }, [exceptionTotals, analytics, autoClassRepairEnabled, syncingClasses, onSyncClasses]);

  return (
    <div className={`mx-auto max-w-[1400px] space-y-4 p-4 sm:space-y-6 sm:p-6 lg:p-8 ${MOBILE_PAGE_BOTTOM}`}>
      <MobilePageHero
        badge="Rillcod Technologies · Accountability"
        title="Platform Accountability"
        description="Executive health score, actionable lapses, teacher coverage, and official audit exports."
        icon={ShieldCheckIcon}
        actions={
          <>
            <button
              type="button"
              onClick={() => openReachOut()}
              className={`${MOBILE_TOUCH_BTN} bg-primary text-primary-foreground hover:opacity-95`}
            >
              <PaperAirplaneIcon className="h-4 w-4" /> Message Parents
            </button>
            <button
              type="button"
              onClick={() => void handleGeneratePdf()}
              disabled={reportBusy || people.length === 0}
              className={`${MOBILE_TOUCH_BTN} border border-border bg-card hover:bg-accent disabled:opacity-50`}
            >
              <ArrowDownTrayIcon className="h-4 w-4 text-primary" />
              {reportBusy ? 'Building PDF…' : 'Export PDF'}
            </button>
            <select
              value={pollInterval}
              onChange={(e) => setPollInterval(Number(e.target.value))}
              className="min-h-11 rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground"
              aria-label="Auto-refresh interval"
            >
              <option value={0}>Auto-refresh: Off</option>
              <option value={15000}>Auto-refresh: 15s</option>
              <option value={30000}>Auto-refresh: 30s</option>
              <option value={60000}>Auto-refresh: 60s</option>
            </select>
            <button
              type="button"
              onClick={() => onRefresh(true)}
              disabled={loading || refreshing}
              className={`${MOBILE_TOUCH_BTN} border border-border bg-card hover:bg-accent disabled:opacity-60`}
            >
              <ArrowPathIcon className={`h-4 w-4 ${loading || refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {c?.term_context && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
              Active Term: {c.term_context.academic_year} · {c.term_context.term_label}
            </span>
          )}
          {pollInterval > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-black text-emerald-700 dark:text-emerald-300">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-emerald-500" />
              Live ({pollInterval / 1000}s)
            </span>
          )}
        </div>
      </MobilePageHero>

      {error && (
        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-700 dark:text-rose-300">{error}</p>
      )}
      {dataQualityWarnings.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200" role="alert">
          <p className="flex items-center gap-2 font-black"><ExclamationTriangleIcon className="h-4 w-4" /> Data quality needs attention</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs">
            {dataQualityWarnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      )}
      {syncFeedback && (
        <p className={`rounded-xl border px-4 py-3 text-sm font-bold flex items-center gap-2 ${syncFeedback.startsWith('Error') ? 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>
          <CheckCircleIcon className="w-4 h-4 shrink-0" /> {syncFeedback}
        </p>
      )}
      {census?.live_total != null && census.live_total !== people.length && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2">
          <span>Snapshot has {people.length.toLocaleString()} accounts, while live database has {census.live_total.toLocaleString()}.</span>
          <button type="button" onClick={() => onRefresh(true)} className="underline font-black shrink-0">Refresh now</button>
        </div>
      )}

      {/* Clean Session Separation Bar — keeps Current Session cleanly separated from Prior/Archive */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Session Scope</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {sessionScope === 'current'
              ? 'Showing active current-session accounts only — old-session and withdrawn records are cleanly separated.'
              : sessionScope === 'archive'
                ? 'Viewing prior-session, withdrawn, and inactive historical accounts.'
                : 'Viewing combined current and historical accounts across all sessions.'}
          </p>
        </div>
        <div className="inline-flex rounded-xl border border-border bg-muted/40 p-1 gap-1 shrink-0">
          {(
            [
              { id: 'current', label: 'Current Session', count: sessionCounts.current },
              { id: 'archive', label: 'Prior / Archive', count: sessionCounts.archive },
              { id: 'all', label: 'All Time', count: sessionCounts.all },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => { setSessionScope(opt.id); setPage(1); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all whitespace-nowrap ${
                sessionScope === opt.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label} <span className="opacity-80">({opt.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Tabs — mobile strip + desktop bar */}
      <MobileScrollStrip
        label="Sections"
        ariaLabel="Accountability sections"
        items={TABS.map((t) => ({
          id: t.id,
          label: t.label,
          hint: t.hint,
          selected: tab === t.id,
          onClick: () => setTab(t.id),
        }))}
      />
      <div className="hidden overflow-x-auto md:block">
        <div className="flex min-w-max gap-1 rounded-2xl border border-border bg-muted/30 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-xl px-4 py-2 text-left transition-all ${tab === t.id ? 'bg-card shadow-sm border border-primary/40' : 'border border-transparent hover:bg-card/60'}`}
            >
              <div className={`text-xs font-black ${tab === t.id ? 'text-primary' : 'text-foreground'}`}>{t.label}</div>
              <div className="text-[10px] text-muted-foreground">{t.hint}</div>
            </button>
          ))}
        </div>
      </div>

      {loading && people.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
          <ArrowPathIcon className="w-5 h-5 animate-spin text-primary" /> Loading accountability snapshot…
        </div>
      ) : (
        <div className={`space-y-6 transition-opacity ${refreshing ? 'opacity-50 pointer-events-none' : ''}`}>

          {/* ── OVERVIEW (Streamlined Executive View) ─────────────────── */}
          {tab === 'overview' && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className={`${CARD} p-5 sm:p-6 lg:col-span-4 flex flex-col justify-between`}>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={LABEL}>Operational Health</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${
                        analytics.healthScore >= 85
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : analytics.healthScore >= 70
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                            : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                      }`}>
                        {analytics.healthScore >= 85 ? 'Healthy' : analytics.healthScore >= 70 ? 'Needs Attention' : 'Action Required'}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className={`text-5xl font-black tracking-tighter tabular-nums ${analytics.healthScore >= 85 ? 'text-emerald-600 dark:text-emerald-400' : analytics.healthScore >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {analytics.healthScore}%
                      </span>
                      <span className="text-xs font-bold text-muted-foreground">/ 100</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                      Weighted across class placement (30%), reports published vs placed students (30%), and parent contact reachability (40%).
                    </p>
                  </div>
                  <div className="w-full bg-muted h-2.5 rounded-full overflow-hidden mt-4">
                    <div
                      style={{ width: `${analytics.healthScore}%` }}
                      className={`h-full transition-all ${analytics.healthScore >= 85 ? 'bg-emerald-500' : analytics.healthScore >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`}
                    />
                  </div>
                </div>

                <div className="lg:col-span-8 grid grid-cols-2 gap-3">
                  <Tile
                    value={`${analytics.placedPct}%`}
                    label="Students Placed"
                    tone={analytics.placedPct >= 90 ? 'good' : analytics.placedPct >= 70 ? 'warn' : 'bad'}
                    sub={`${analytics.placedOnRoster} in a class · ${analytics.unplaced} unplaced`}
                    onClick={() => focusFlag(analytics.unplaced > 0 ? 'no_class' : null)}
                  />
                  <Tile
                    value={`${analytics.publishedPct}%`}
                    label="Reports Published"
                    tone={analytics.publishedPct >= 85 ? 'good' : analytics.publishedPct >= 50 ? 'warn' : 'bad'}
                    sub={`${analytics.publishedReports} sent · ${analytics.draftReports} draft${analytics.draftReports === 1 ? '' : 's'}`}
                    onClick={() => setTab('reports')}
                  />
                  <Tile
                    value={`${analytics.parentEmailReachPct}%`}
                    label="Parent Contacts"
                    tone={analytics.parentEmailReachPct >= 80 ? 'good' : analytics.parentEmailReachPct >= 50 ? 'warn' : 'bad'}
                    sub={`${analytics.parentEmailMatched} email · ${analytics.parentPhoneMatched} phone`}
                    onClick={() => setTab('comms')}
                  />
                  <Tile
                    value={people.length.toLocaleString()}
                    label="Total Accounts"
                    sub={`${students.length} students · ${teachers.length} teachers · ${parents.length} parents`}
                    onClick={() => { clearFilters(); setTab('people'); }}
                  />
                </div>
              </div>

              <Section
                title={`Action Queue (${actionQueueItems.length} active)`}
                icon={<ExclamationTriangleIcon className="w-3.5 h-3.5 text-primary" />}
                action={
                  <Link
                    href={ACADEMIC_EXCEPTIONS_HREF}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:border-primary/50"
                  >
                    Academic Office Cleanup →
                  </Link>
                }
              >
                {actionQueueItems.length === 0 ? (
                  <div className={`${CARD} p-5 flex items-center gap-3 border-emerald-500/30 bg-emerald-500/5`}>
                    <CheckCircleIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                      All clear — zero urgent accountability lapses for this term.
                    </p>
                  </div>
                ) : (
                  <div className={`${CARD} divide-y divide-border overflow-hidden`}>
                    {actionQueueItems.map((item) => (
                      <div key={item.key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3.5 hover:bg-muted/30 transition-colors">
                        <div className="flex items-start gap-3 min-w-0">
                          <span className={`inline-flex min-w-10 justify-center rounded-lg px-2 py-1 text-xs font-black tabular-nums shrink-0 ${
                            item.tone === 'rose'
                              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                              : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                          }`}>
                            {item.count}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-foreground">{item.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                          </div>
                        </div>
                        {item.href ? (
                          <Link
                            href={item.href}
                            className="inline-flex items-center justify-center rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-bold text-foreground hover:border-primary/50 shrink-0"
                          >
                            {item.cta} →
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={item.onClick}
                            className="inline-flex items-center justify-center rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-bold text-foreground hover:border-primary/50 shrink-0"
                          >
                            {item.cta} →
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className={`${CARD} p-5 space-y-4`}>
                  <div className="flex items-center justify-between">
                    <h3 className={`${LABEL} flex items-center gap-1.5`}>
                      <UserIcon className="w-3.5 h-3.5" /> Accounts by Role
                    </h3>
                    <button
                      type="button"
                      onClick={() => { clearFilters(); setTab('people'); }}
                      className="text-xs font-bold text-primary hover:underline"
                    >
                      Open Directory →
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                    <DonutChart data={roleDonut} height={190} centerValue={people.length} centerLabel="Accounts" />
                    <div className="space-y-1.5">
                      {roleDonut.map((s) => (
                        <button
                          key={s.label}
                          type="button"
                          onClick={() => {
                            const entry = Object.entries(roleCounts).find(([r]) => roleMeta(r).label === s.label);
                            focusRole(entry ? entry[0] : null);
                          }}
                          className="flex w-full items-center justify-between text-xs hover:bg-muted/60 rounded-lg px-2.5 py-1.5 transition-colors"
                        >
                          <span className="flex items-center gap-2 font-bold text-foreground">
                            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                            {s.label}
                          </span>
                          <span className="tabular-nums font-black text-muted-foreground">{s.value}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={`${CARD} p-5 space-y-4`}>
                  <div className="flex items-center justify-between">
                    <h3 className={`${LABEL} flex items-center gap-1.5`}>
                      <ChartBarIcon className="w-3.5 h-3.5" /> Term Coverage Breakdown
                    </h3>
                    <button
                      type="button"
                      onClick={() => setTab('reports')}
                      className="text-xs font-bold text-primary hover:underline"
                    >
                      Class Details →
                    </button>
                  </div>
                  <div className="space-y-4 pt-1">
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-bold text-foreground">Students Placed in Classes</span>
                        <span className="font-black text-emerald-600 dark:text-emerald-400">{analytics.placedPct}%</span>
                      </div>
                      <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden flex">
                        <div style={{ width: `${analytics.placedPct}%` }} className="bg-emerald-500 h-full" />
                        <div style={{ width: `${Math.max(0, 100 - analytics.placedPct)}%` }} className="bg-rose-500/70 h-full" />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {analytics.placedOnRoster} placed · {analytics.unplaced} unplaced · {analytics.withdrawnCount} withdrawn
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-bold text-foreground">Progress Reports Published (vs Placed)</span>
                        <span className="font-black text-primary">{analytics.publishedPct}%</span>
                      </div>
                      <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden flex">
                        <div style={{ width: `${analytics.publishedPct}%` }} className="bg-emerald-500 h-full" />
                        <div style={{ width: `${analytics.draftPct}%` }} className="bg-amber-500 h-full" />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {analytics.publishedReports} published · {analytics.draftReports} draft · {analytics.classesWithMissing} of {analytics.classCount} classes missing reports
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-bold text-foreground">Parent Email Reachability</span>
                        <span className="font-black text-primary">{analytics.parentEmailReachPct}%</span>
                      </div>
                      <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden flex">
                        <div style={{ width: `${analytics.parentEmailReachPct}%` }} className="bg-primary h-full" />
                        <div style={{ width: `${Math.max(0, 100 - analytics.parentEmailReachPct)}%` }} className="bg-amber-500/70 h-full" />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {analytics.parentEmailMatched} email linked · {analytics.parentPhoneMatched} phone linked
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── SCHOOLS SCORECARD (Every School in DB — Zero Omissions) ── */}
          {tab === 'schools' && (
            <Section
              title={`All Schools (${filteredSchoolsSummary.length} of ${schoolsSummary.length})`}
              icon={<BuildingOfficeIcon className="w-3.5 h-3.5 text-primary" />}
              action={
                <input
                  value={schoolSearch}
                  onChange={(e) => setSchoolSearch(e.target.value)}
                  placeholder="Search any school by name, city, or status…"
                  aria-label="Search schools scorecard"
                  className="w-full sm:w-72 bg-card border border-border rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-primary"
                />
              }
            >
              {filteredSchoolsSummary.length === 0 ? (
                <div className={`${CARD} p-10 text-center text-sm text-muted-foreground`}>
                  No schools match &ldquo;{schoolSearch}&rdquo;.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredSchoolsSummary.map((s) => (
                    <div key={s.id} className={`${CARD} p-4 sm:p-5 flex flex-col justify-between gap-4 hover:border-primary/40 transition-colors`}>
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-sm font-black text-foreground truncate">{s.name}</h3>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {[s.city, s.state].filter(Boolean).join(', ') || 'Nigeria'}
                              {s.status ? ` · ${s.status}` : ''}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-black tabular-nums ${
                            s.health_score >= 80
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                              : s.health_score >= 50
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                          }`}>
                            {s.health_score}%
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-1">
                          <div className="rounded-xl bg-muted/40 border border-border/60 px-2.5 py-2 text-center">
                            <div className="text-base font-black tabular-nums text-foreground">{s.students_total}</div>
                            <div className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Students</div>
                          </div>
                          <div className="rounded-xl bg-muted/40 border border-border/60 px-2.5 py-2 text-center">
                            <div className="text-base font-black tabular-nums text-foreground">{s.classes_count}</div>
                            <div className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Classes</div>
                          </div>
                          <div className="rounded-xl bg-muted/40 border border-border/60 px-2.5 py-2 text-center">
                            <div className="text-base font-black tabular-nums text-foreground">{s.parent_email_pct}%</div>
                            <div className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Parents</div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1 pt-1">
                          {s.gaps.length === 0 ? (
                            <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                              All set this session
                            </span>
                          ) : (
                            s.gaps.map((g) => (
                              <span key={g} className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                                {g}
                              </span>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/70">
                        <button
                          type="button"
                          onClick={() => {
                            setSchool(s.name);
                            setRole(null);
                            setFlag(null);
                            setPage(1);
                            setTab('people');
                          }}
                          className="text-xs font-bold text-primary hover:underline"
                        >
                          View Accounts ({s.students_total}) →
                        </button>
                        <Link
                          href={`/dashboard/classes?school=${encodeURIComponent(s.name)}`}
                          className="text-xs font-bold text-muted-foreground hover:text-foreground"
                        >
                          Classes →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* ── DIRECTORY (PEOPLE) ────────────────────────────────────── */}
          {tab === 'people' && (
            <Section
              title={`${filtered.length} account${filtered.length === 1 ? '' : 's'}${role ? ` · ${roleMeta(role).label}` : ''}${flag ? ` · ${FLAG_LABEL[flag] ?? flag}` : ''}`}
              icon={<BuildingOfficeIcon className="w-3.5 h-3.5" />}
              action={
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                  <input
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    placeholder="Search name, email, school…"
                    aria-label="Search accounts"
                    className="w-full sm:w-52 bg-card border border-border rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-primary"
                  />
                  <select
                    aria-label="Filter by role"
                    value={role || ''}
                    onChange={(e) => { setRole(e.target.value || null); setPage(1); }}
                    className="bg-card border border-border rounded-xl px-3 py-2 text-xs font-bold"
                  >
                    <option value="">All roles</option>
                    {Object.keys(roleCounts).sort().map((r) => (
                      <option key={r} value={r}>{roleMeta(r).label} ({roleCounts[r]})</option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter by issue"
                    value={flag || ''}
                    onChange={(e) => { setFlag(e.target.value || null); setPage(1); }}
                    className="bg-card border border-border rounded-xl px-3 py-2 text-xs font-bold max-w-[13rem]"
                  >
                    <option value="">All issues</option>
                    {Object.entries(flagCounts).sort((a, b) => b[1] - a[1]).map(([f, n]) => (
                      <option key={f} value={f}>{FLAG_LABEL[f] ?? f} ({n})</option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter by school"
                    value={school}
                    onChange={(e) => { setSchool(e.target.value); setPage(1); }}
                    className="bg-card border border-border rounded-xl px-3 py-2 text-xs font-bold max-w-[12rem]"
                  >
                    <option value="">All schools</option>
                    {schools.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select
                    aria-label="Sort accounts"
                    value={peopleSort}
                    onChange={(e) => setPeopleSort(e.target.value as typeof peopleSort)}
                    className="bg-card border border-border rounded-xl px-3 py-2 text-xs font-bold"
                  >
                    <option value="role">Sort: Role</option>
                    <option value="name">Sort: Name</option>
                    <option value="school">Sort: School</option>
                  </select>
                  {(flag || role || school || search) && (
                    <button type="button" onClick={clearFilters} className="rounded-xl border border-border px-3 py-2 text-xs font-black uppercase tracking-wider text-muted-foreground hover:bg-accent">
                      Clear
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => downloadPeopleCsv(filtered)}
                    disabled={!filtered.length}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-black uppercase tracking-wider hover:bg-accent disabled:opacity-40"
                  >
                    <ArrowDownTrayIcon className="w-3.5 h-3.5" /> CSV
                  </button>
                </div>
              }
            >
              {selectedIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2.5 text-xs">
                  <span className="font-black text-primary">{selectedIds.size} selected</span>
                  <button type="button" onClick={() => setReachOutModalOpen(true)} className="font-black uppercase tracking-wider text-primary hover:underline">
                    Message Selected Parents
                  </button>
                  {people.some((p) => selectedIds.has(p.id) && isStudent(p)) && (
                    <button
                      type="button"
                      onClick={() => setPlacementTargets(people.filter((p) => selectedIds.has(p.id) && isStudent(p)))}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary text-primary-foreground px-2.5 py-1 font-black uppercase tracking-wider"
                    >
                      <AcademicCapIcon className="w-3.5 h-3.5" />
                      Place Selected in Class
                    </button>
                  )}
                  <button type="button" onClick={() => setSelectedIds(new Set())} className="text-muted-foreground hover:underline ml-auto">
                    Clear selection
                  </button>
                </div>
              )}

              <div className={`${CARD} overflow-hidden`}>
                {/* Mobile Card List (zero horizontal scroll) */}
                <div className="divide-y divide-border md:hidden">
                  {paginatedPeople.map((p) => {
                    const student = isStudent(p);
                    const teacher = isTeacher(p);
                    return (
                      <div key={p.id} className={`p-4 space-y-2.5 ${selectedIds.has(p.id) ? 'bg-primary/5' : ''}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(p.id)}
                              onChange={() => toggleSelect(p.id)}
                              aria-label={`Select ${p.full_name || 'account'}`}
                              className="mt-1 rounded border-border accent-primary"
                            />
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-foreground truncate">{p.full_name || '(no name)'}</p>
                              <p className="text-xs text-muted-foreground truncate">{p.email || '—'}</p>
                            </div>
                          </div>
                          <RoleBadge role={p.role} size="sm" />
                        </div>

                        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                          <span>School: <strong className="text-foreground">{p.school_name || '—'}</strong></span>
                          {student && (
                            <span>Class: <strong className={p.class_from_roster ? 'text-foreground' : 'text-rose-600 dark:text-rose-400'}>{p.class_from_roster || 'Not placed'}</strong></span>
                          )}
                        </div>

                        {(p.flags ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {(p.flags ?? []).map((f) => (
                              <span key={f} className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${f === 'withdrawn' || f === 'no_class' ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'bg-muted text-muted-foreground'}`}>
                                {FLAG_LABEL[f] ?? f.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2 pt-1">
                          {student && (
                            <button type="button" onClick={() => openReachOut(p)} className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary">
                              <PaperAirplaneIcon className="w-3.5 h-3.5" /> Message Parent
                            </button>
                          )}
                          {student && (p.flags ?? []).includes('no_class') && (
                            <button
                              type="button"
                              onClick={() => setPlacementTargets([p])}
                              className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary"
                            >
                              <AcademicCapIcon className="w-3.5 h-3.5" /> Place in Class
                            </button>
                          )}
                          {student && (p.flags ?? []).includes('class_mismatch') && (
                            <button type="button" onClick={onSyncClasses} disabled={syncingClasses} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-foreground">
                              <CogIcon className="w-3 h-3" /> Fix Class
                            </button>
                          )}
                          {teacher && (
                            <button type="button" onClick={() => setTab('teachers')} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-foreground">
                              Teacher Report →
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm min-w-[820px]">
                    <thead>
                      <tr className="border-b border-border text-left bg-muted/25">
                        <th className="px-3 py-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={allPaginatedSelected}
                            onChange={toggleSelectAll}
                            aria-label="Select all visible accounts"
                            className="rounded border-border accent-primary"
                          />
                        </th>
                        {['Account', 'Role', 'School / Class', 'Reports', 'Gaps / Flags', 'Actions'].map((h) => (
                          <th key={h} className={`${LABEL} px-3 py-3 whitespace-nowrap`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {paginatedPeople.map((p) => {
                        const student = isStudent(p);
                        const teacher = isTeacher(p);
                        return (
                          <tr key={p.id} className={`hover:bg-muted/30 ${selectedIds.has(p.id) ? 'bg-primary/5' : ''}`}>
                            <td className="px-3 py-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(p.id)}
                                onChange={() => toggleSelect(p.id)}
                                aria-label={`Select ${p.full_name || 'account'}`}
                                className="rounded border-border accent-primary"
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="font-bold text-foreground">{p.full_name || '(no name)'}</div>
                              <div className="text-xs text-muted-foreground">{p.email || '—'}</div>
                              {p.enrollment_type && student && (
                                <div className="text-[10px] text-muted-foreground mt-0.5 capitalize">{p.enrollment_type.replace(/_/g, ' ')}</div>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <RoleBadge role={p.role} size="sm" />
                              {!p.is_active && <div className="text-[10px] text-rose-600 dark:text-rose-400 font-bold mt-1">INACTIVE</div>}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                              <div className="text-foreground font-medium">{p.school_name || '—'}</div>
                              {student ? (
                                <div className="text-xs mt-0.5">
                                  {p.class_from_roster || <span className="text-rose-600 dark:text-rose-400 font-bold">Not in a class</span>}
                                  {p.class_on_profile && p.class_from_roster && p.class_on_profile !== p.class_from_roster && (
                                    <div className="text-amber-600 dark:text-amber-400">Account says: {p.class_on_profile}</div>
                                  )}
                                </div>
                              ) : teacher ? (
                                <div className="text-xs mt-0.5 text-primary font-semibold">Teaching staff</div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                              {p.reports_total === 0 ? '—' : (
                                <>
                                  {p.reports_published} sent
                                  {p.reports_draft > 0 && <span className="text-amber-600 dark:text-amber-400"> · {p.reports_draft} draft</span>}
                                </>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex flex-wrap gap-1 max-w-[16rem]">
                                {(p.flags ?? []).length === 0 && <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">All good</span>}
                                {(p.flags ?? []).map((f) => (
                                  <span key={f} title={FLAG_LABEL[f]} className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${f === 'withdrawn' || f === 'no_class' ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'bg-muted text-muted-foreground'}`}>
                                    {FLAG_LABEL[f] ?? f.replace(/_/g, ' ')}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <div className="flex flex-wrap gap-2">
                                {student && (
                                  <button type="button" onClick={() => openReachOut(p)} className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
                                    <PaperAirplaneIcon className="w-3.5 h-3.5" /> Message Parent
                                  </button>
                                )}
                                {student && ((p.flags ?? []).includes('no_parent_email') || (p.flags ?? []).includes('no_parent_phone')) && (
                                  <Link href="/dashboard/parents" className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-400 hover:underline">
                                    <LinkIcon className="w-3 h-3" /> Link Parent
                                  </Link>
                                )}
                                {student && (p.flags ?? []).includes('no_class') && (
                                  <button
                                    type="button"
                                    onClick={() => setPlacementTargets([p])}
                                    className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                                  >
                                    <AcademicCapIcon className="w-3.5 h-3.5" /> Place in Class
                                  </button>
                                )}
                                {student && (p.flags ?? []).includes('class_mismatch') && (
                                  <button type="button" onClick={onSyncClasses} disabled={syncingClasses} className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline disabled:opacity-50">
                                    <CogIcon className="w-3 h-3" /> Fix Class
                                  </button>
                                )}
                                {teacher && (
                                  <button type="button" onClick={() => setTab('teachers')} className="text-xs font-bold text-primary hover:underline">
                                    View Teachers
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-border">
                  <div className="text-xs text-muted-foreground">
                    Showing <strong className="text-foreground">{totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1}</strong>–
                    <strong className="text-foreground">{Math.min(currentPage * pageSize, totalItems)}</strong> of{' '}
                    <strong className="text-foreground">{totalItems}</strong>
                    <select
                      aria-label="Rows per page"
                      value={pageSize}
                      onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                      className="ml-2 bg-card border border-border rounded-md px-2 py-1 text-xs"
                    >
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
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">No accounts match this filter.</p>
                )}
              </div>
            </Section>
          )}

          {/* ── TEACHERS ─────────────────────────────────────────── */}
          {tab === 'teachers' && <TeacherAccountabilityPanel />}

          {/* ── CLASSES & REPORTS ─────────────────────────────────── */}
          {tab === 'reports' && (
            <>
              <Section title="Reports (active term)" icon={<ClipboardDocumentListIcon className="w-3.5 h-3.5" />}>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <Tile value={c?.totals.reports ?? 0} label="Reports written" />
                  <Tile value={c?.totals.published ?? 0} label="Published" tone="good" />
                  <Tile value={c?.totals.draft ?? 0} label="Unpublished draft" tone="warn" onClick={() => focusFlag('draft_pending')} />
                  <Tile value={c?.gaps.reports_missing_course ?? 0} label="Missing course link" tone="warn" />
                  <Tile value={c?.totals.students_with_report ?? 0} label="Students with report" />
                  <Tile value={c?.totals.students_on_roster ?? 0} label="Students in classes" />
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
                <Section title="Classes with students but zero reports" icon={<ExclamationTriangleIcon className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />}>
                  <div className={`${CARD} divide-y divide-border`}>
                    {c.classes_without_reports.map((x) => (
                      <div key={x.class} className="flex items-center justify-between px-4 py-3 gap-3">
                        <span className="text-sm font-bold text-foreground">{x.class}</span>
                        <span className="text-sm font-black text-rose-600 dark:text-rose-400">{x.students} students · 0 reports</span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {c && c.by_class.length > 0 && (
                <Section title="Coverage by class" icon={<AcademicCapIcon className="w-3.5 h-3.5" />}>
                  <div className={`${CARD} overflow-x-auto`}>
                    <table className="w-full text-sm min-w-[680px]">
                      <thead>
                        <tr className="border-b border-border text-left bg-muted/25">
                          {['Class', 'Students', 'Reports', 'Published', 'Drafts', 'Missing', 'Progress'].map((h) => (
                            <th key={h} className={`${LABEL} px-3 py-3`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {c.by_class.map((row: ClassRow, idx) => {
                          const pct = row.students > 0 ? Math.min(100, Math.round((row.published / row.students) * 100)) : 0;
                          const missing = row.missing ?? Math.max(0, row.students - (row.published + row.draft));
                          return (
                            <tr key={`${row.class}-${idx}`} className="hover:bg-muted/30">
                              <td className="px-3 py-2.5 font-bold">{row.class}</td>
                              <td className="px-3 py-2.5 text-muted-foreground">{row.students}</td>
                              <td className="px-3 py-2.5 text-muted-foreground">{row.reports}</td>
                              <td className="px-3 py-2.5">{row.published}</td>
                              <td className="px-3 py-2.5">{row.draft > 0 ? <span className="text-amber-600 dark:text-amber-400 font-bold">{row.draft}</span> : '—'}</td>
                              <td className="px-3 py-2.5">
                                {missing > 0
                                  ? <span className="text-xs font-black text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">{missing} missing</span>
                                  : <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Complete</span>}
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-2 justify-end">
                                  <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                                    <div style={{ width: `${pct}%` }} className={`h-full ${pct === 100 ? 'bg-emerald-500' : pct > 50 ? 'bg-primary' : 'bg-amber-500'}`} />
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
                <Section title="Cross-term unpublished backlog" icon={<ExclamationTriangleIcon className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />}>
                  <div className={`${CARD} p-4 text-sm text-muted-foreground`}>
                    Across all terms there are <strong className="text-foreground">{backlog.all_terms.drafts}</strong> unpublished reports —{' '}
                    <strong className="text-rose-600 dark:text-rose-400">{backlog.hidden_by_term_filter.drafts}</strong> sit outside the active term.
                  </div>
                  {backlog.overdue_by_teacher.length > 0 && (
                    <div className={`${CARD} overflow-x-auto`}>
                      <table className="w-full text-sm min-w-[600px]">
                        <thead>
                          <tr className="border-b border-border text-left bg-muted/25">
                            {['Teacher', 'Course', 'Term', 'Unpublished', 'Oldest'].map((h) => (
                              <th key={h} className={`${LABEL} px-3 py-3`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {backlog.overdue_by_teacher.map((o, i) => (
                            <tr key={i} className="hover:bg-muted/30">
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
            </>
          )}

          {/* ── PARENT REACH (COMMS) ──────────────────────────────── */}
          {tab === 'comms' && (
            <>
              <Section title="Parent-student contact reachability" icon={<EnvelopeIcon className="w-3.5 h-3.5 text-primary" />}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className={`${CARD} p-5 space-y-1`}>
                    <div className="flex justify-between"><span className="text-xs font-bold flex items-center gap-1"><EnvelopeIcon className="w-3.5 h-3.5" /> Parent email</span><span className="text-xs font-black text-primary">{analytics.parentEmailReachPct}%</span></div>
                    <div className="text-3xl font-black">{analytics.parentEmailMatched}</div>
                    <p className="text-[11px] text-muted-foreground">Students with parent email on file</p>
                  </div>
                  <div className={`${CARD} p-5 space-y-1`}>
                    <div className="flex justify-between"><span className="text-xs font-bold flex items-center gap-1"><PhoneIcon className="w-3.5 h-3.5" /> Parent phone</span><span className="text-xs font-black text-primary">{analytics.parentPhoneReachPct}%</span></div>
                    <div className="text-3xl font-black">{analytics.parentPhoneMatched}</div>
                    <p className="text-[11px] text-muted-foreground">Students with parent phone on file</p>
                  </div>
                  <div className={`${CARD} p-5 space-y-1`}>
                    <div className="flex justify-between"><span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircleIcon className="w-3.5 h-3.5" /> Fully matched</span><span className="text-xs font-black text-emerald-600 dark:text-emerald-400">{analytics.parentFullyMatchedPct}%</span></div>
                    <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{analytics.parentFullyMatched}</div>
                    <p className="text-[11px] text-muted-foreground">Both email &amp; phone attached</p>
                  </div>
                  <div className={`${CARD} p-5 space-y-1`}>
                    <div className="flex justify-between"><span className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1"><ExclamationTriangleIcon className="w-3.5 h-3.5" /> Unmatched</span><span className="text-xs font-black text-rose-600 dark:text-rose-400">{analytics.parentUnmatched}</span></div>
                    <div className="text-3xl font-black text-rose-600 dark:text-rose-400">{analytics.parentUnmatched}</div>
                    <p className="text-[11px] text-muted-foreground">Zero parent contact details</p>
                  </div>
                </div>
              </Section>

              {c?.by_provider && c.by_provider.length > 0 && (
                <Section title="Email providers" icon={<PaperAirplaneIcon className="w-3.5 h-3.5" />}>
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
                    <table className="w-full text-sm min-w-[680px]">
                      <thead>
                        <tr className="border-b border-border text-left bg-muted/25">
                          {['Category', 'Provider', 'Dispatched', 'Delivered', 'Failed', 'Pending', 'Rate'].map((h) => (
                            <th key={h} className={`${LABEL} px-3 py-3`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {c.by_email_type.map((em, idx) => {
                          const pct = em.total_dispatched > 0 ? Math.round((em.delivered / em.total_dispatched) * 100) : 0;
                          return (
                            <tr key={idx} className="hover:bg-muted/30">
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
            </>
          )}

          {/* ── EXPORT / OFFICIAL REPORTS ─────────────────────────── */}
          {tab === 'report' && (
            <Section title="Official Rillcod Technologies Exports" icon={<ArrowDownTrayIcon className="w-3.5 h-3.5 text-primary" />}>
              <div className={`${CARD} p-5 sm:p-6 space-y-5`}>
                <div>
                  <h3 className="text-lg font-black text-foreground">Executive Accountability PDF &amp; CSV</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                    Generates an official Rillcod Technologies branded multi-section audit PDF with logo letterhead, accurate term KPIs,
                    teacher performance, class coverage, and actionable gap tables — or clean Excel-safe CSV spreadsheets.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Tile value={people.length} label="Total Accounts" />
                  <Tile value={teachers.length} label="Teachers" />
                  <Tile value={gapPeople.length} label="Accounts with Gaps" tone={gapPeople.length > 0 ? 'warn' : 'good'} />
                  <Tile value={`${analytics.healthScore}%`} label="Health Score" tone={analytics.healthScore >= 85 ? 'good' : analytics.healthScore >= 70 ? 'warn' : 'bad'} />
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleGeneratePdf}
                    disabled={reportBusy || people.length === 0}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-xs font-black uppercase tracking-wider hover:opacity-95 disabled:opacity-50"
                  >
                    <ArrowDownTrayIcon className={`w-4 h-4 ${reportBusy ? 'animate-pulse' : ''}`} />
                    {reportBusy ? 'Building PDF…' : 'Download Official PDF Report'}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadPeopleCsv(gapPeople, 'rillcod-accountability-gaps.csv')}
                    disabled={gapPeople.length === 0}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300 px-4 py-2.5 text-xs font-black uppercase tracking-wider disabled:opacity-50"
                  >
                    <ArrowDownTrayIcon className="w-4 h-4" /> Export Gaps Only ({gapPeople.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadPeopleCsv(people, 'rillcod-accountability-all.csv')}
                    disabled={people.length === 0}
                    className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-xs font-black uppercase tracking-wider hover:bg-accent disabled:opacity-50"
                  >
                    <ArrowDownTrayIcon className="w-4 h-4" /> Export All (CSV)
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadPeopleCsv(teachers, 'rillcod-accountability-teachers.csv')}
                    disabled={teachers.length === 0}
                    className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-xs font-black uppercase tracking-wider hover:bg-accent disabled:opacity-50"
                  >
                    Teachers CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadPeopleCsv(students, 'rillcod-accountability-students.csv')}
                    disabled={students.length === 0}
                    className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-xs font-black uppercase tracking-wider hover:bg-accent disabled:opacity-50"
                  >
                    Students CSV
                  </button>
                </div>

                {reportMsg && (
                  <p className={`text-sm font-bold ${reportMsg.startsWith('Error') ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{reportMsg}</p>
                )}
              </div>

              {classChartData.length > 0 && (
                <div className={`${CARD} p-5 sm:p-6 space-y-3`}>
                  <p className={LABEL}>Class Publication Snapshot</p>
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
            </Section>
          )}

          {c && (
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <p className="text-xs text-muted-foreground">Snapshot taken {fmtDate(c.generated_at)}</p>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live Snapshot
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

      <QuickClassPlacementModal
        isOpen={placementTargets.length > 0}
        onClose={() => setPlacementTargets([])}
        students={placementTargets}
        onPlaced={() => {
          setSelectedIds(new Set());
          setPlacementTargets([]);
          onRefresh(true);
        }}
      />
    </div>
  );
}
