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
  CHART_COLORS, DonutChart, StackedBarChart,
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
  { id: 'schools', label: 'Schools', hint: 'Scorecards & rollover' },
  { id: 'teachers', label: 'Teachers & Classes', hint: 'Delivery & report backlog' },
  { id: 'people', label: 'Directory', hint: 'Accounts, flags & placement' },
  { id: 'comms', label: 'Reach & Exports', hint: 'Parent comms, PDF & CSV' },
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
  const [teachingFocus, setTeachingFocus] = useState<'all' | 'teachers' | 'classes' | 'backlog'>('all');
  const [sessionScope, setSessionScope] = useState<'current' | 'archive' | 'all'>('current');
  const [schoolSearch, setSchoolSearch] = useState('');
  const [reachOutModalOpen, setReachOutModalOpen] = useState(false);
  const [rolloverSchoolId, setRolloverSchoolId] = useState<string | null>(null);
  const [rolloverExecuting, setRolloverExecuting] = useState(false);
  const [rolloverBanner, setRolloverBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [rolloverModal, setRolloverModal] = useState<{
    schoolId: string;
    schoolName: string;
    currentSession: string;
    availableClasses: Array<{ id: string; name: string }>;
    skippedClasses: Array<{ id: string; name: string; reason: string }>;
    requireTeacherConfirmation: boolean;
    rows: Array<{
      row_key: string;
      from_class_id: string;
      from_class_name: string;
      from_grade: string;
      to_class_id: string | null;
      to_class_name: string | null;
      to_grade: string | null;
      is_terminal?: boolean;
      is_sister_school_move?: boolean;
      action: 'promote' | 'upgrade_in_place' | 'archive_graduated' | 'withdraw_terminal' | 'mark_inactive';
      student_count: number;
      enabled: boolean;
    }>;
  } | null>(null);
  const [integrityBusy, setIntegrityBusy] = useState(false);
  const [integrityBanner, setIntegrityBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleCheckRosterIntegrity = async () => {
    setIntegrityBusy(true);
    setIntegrityBanner(null);
    try {
      const res = await fetch('/api/admin/roster-integrity', { cache: 'no-store' });
      const scan = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(scan.error || 'Could not run roster integrity check.');
      const totalIssues = (scan.stale_rosters_count ?? 0) + (scan.stale_enrollments_count ?? 0);
      if (totalIssues === 0) {
        setIntegrityBanner({
          type: 'success',
          text: `All ${scan.checked_students} regular students are clean — 0 duplicate rosters and 0 stale programme enrollments.`,
        });
        return;
      }
      const ok = confirm(
        `Roster Integrity Check (${scan.checked_students} regular students scanned):\n\n` +
          `• ${scan.stale_rosters_count} stale duplicate regular-class roster(s)\n` +
          `• ${scan.stale_enrollments_count} stale other-programme enrollment(s)\n\n` +
          `Specialized programmes (Summer School / Bootcamp / Online) are untouched.\n` +
          `Clean these up now?`,
      );
      if (!ok) {
        setIntegrityBanner({
          type: 'error',
          text: `Found ${scan.stale_rosters_count} stale roster(s) and ${scan.stale_enrollments_count} stale enrollment(s). Click Check Integrity again when ready to fix.`,
        });
        return;
      }
      const fixRes = await fetch('/api/admin/roster-integrity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      const fixJson = await fixRes.json().catch(() => ({}));
      if (!fixRes.ok) throw new Error(fixJson.error || 'Integrity repair failed.');
      setIntegrityBanner({ type: 'success', text: fixJson.message || 'Roster integrity repaired.' });
      onRefresh(true);
    } catch (err: any) {
      setIntegrityBanner({ type: 'error', text: err?.message || 'Integrity check failed.' });
    } finally {
      setIntegrityBusy(false);
    }
  };

  const handleSchoolRollover = async (schoolId: string, schoolName: string) => {
    setRolloverSchoolId(schoolId);
    setRolloverBanner(null);
    try {
      const previewRes = await fetch(`/api/admin/schools/${schoolId}/rollover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: true }),
      });
      const preview = await previewRes.json().catch(() => ({}));
      if (!previewRes.ok) throw new Error(preview.error || 'Could not preview school rollover.');

      const actionable = (preview.plan ?? []).filter((p: any) => p.student_count > 0);
      if (actionable.length === 0) {
        setRolloverBanner({
          type: 'error',
          text: `No active students ready to roll over in ${schoolName}.`,
        });
        return;
      }

      setRolloverModal({
        schoolId,
        schoolName,
        currentSession: preview.current_session || '',
        availableClasses: Array.isArray(preview.available_classes) ? preview.available_classes : [],
        skippedClasses: Array.isArray(preview.skipped_classes) ? preview.skipped_classes : [],
        requireTeacherConfirmation: true,
        rows: actionable.map((p: any) => ({ ...p, enabled: true })),
      });
    } catch (err: any) {
      setRolloverBanner({ type: 'error', text: err?.message || 'Rollover preview failed.' });
    } finally {
      setRolloverSchoolId(null);
    }
  };

  const executeSchoolRollover = async () => {
    if (!rolloverModal) return;
    const enabledRows = rolloverModal.rows.filter((r) => r.enabled);
    if (enabledRows.length === 0) {
      setRolloverBanner({ type: 'error', text: 'Select at least one class transition to run rollover.' });
      return;
    }
    setRolloverExecuting(true);
    try {
      const execRes = await fetch(`/api/admin/schools/${rolloverModal.schoolId}/rollover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dry_run: false,
          require_teacher_confirmation: rolloverModal.requireTeacherConfirmation,
          overrides: rolloverModal.rows.map((r) => ({
            row_key: r.row_key,
            enabled: r.enabled,
            action: r.action,
            to_class_id: r.to_class_id,
          })),
        }),
      });
      const execJson = await execRes.json().catch(() => ({}));
      if (!execRes.ok) throw new Error(execJson.error || 'Rollover failed.');

      setRolloverBanner({
        type: 'success',
        text: execJson.message || `Session rollover complete for ${rolloverModal.schoolName}.`,
      });
      setRolloverModal(null);
      onRefresh(true);
    } catch (err: any) {
      setRolloverBanner({ type: 'error', text: err?.message || 'Rollover failed.' });
    } finally {
      setRolloverExecuting(false);
    }
  };

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
        description="See what needs attention today, check school health, and clear pending reports in one place."
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

      {/* Compact Session Scope + Quick Utilities Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-border bg-card px-3.5 py-2.5 shadow-sm">
        <div className="inline-flex flex-wrap rounded-xl border border-border bg-muted/40 p-1 gap-1">
          {(
            [
              { id: 'current', label: 'Current Session', count: sessionCounts.current },
              { id: 'archive', label: 'Archive', count: sessionCounts.archive },
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
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={pollInterval}
            onChange={(e) => setPollInterval(Number(e.target.value))}
            className="min-h-9 rounded-xl border border-border bg-background px-2.5 text-xs font-bold text-foreground"
            aria-label="Auto-refresh interval"
          >
            <option value={0}>Live Sync: Off</option>
            <option value={15000}>Live Sync: 15s</option>
            <option value={30000}>Live Sync: 30s</option>
            <option value={60000}>Live Sync: 60s</option>
          </select>
          <button
            type="button"
            onClick={() => void handleCheckRosterIntegrity()}
            disabled={integrityBusy}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-50"
          >
            <ShieldCheckIcon className={`h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400 ${integrityBusy ? 'animate-pulse' : ''}`} />
            {integrityBusy ? 'Scanning…' : 'Check Integrity'}
          </button>
          <button
            type="button"
            onClick={() => void handleGeneratePdf()}
            disabled={reportBusy || people.length === 0}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-50"
          >
            <ArrowDownTrayIcon className="h-3.5 w-3.5 text-primary" />
            {reportBusy ? 'Building…' : 'PDF Report'}
          </button>
        </div>
      </div>
      {integrityBanner && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-bold ${
            integrityBanner.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200'
          }`}
        >
          {integrityBanner.text}
        </div>
      )}

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
                    onClick={() => { setTeachingFocus('classes'); setTab('teachers'); }}
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
                      <BuildingOfficeIcon className="w-3.5 h-3.5 text-primary" /> Schools Watchlist
                    </h3>
                    <button
                      type="button"
                      onClick={() => setTab('schools')}
                      className="text-xs font-bold text-primary hover:underline"
                    >
                      All {schoolsSummary.length} Schools →
                    </button>
                  </div>
                  {schoolsSummary.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-6 text-center">No partner schools loaded.</p>
                  ) : (
                    <div className="divide-y divide-border/70">
                      {[...schoolsSummary]
                        .filter((s) => s.students_total > 0 || s.classes_count > 0)
                        .sort((a, b) => a.health_score - b.health_score || b.students_total - a.students_total)
                        .slice(0, 5)
                        .map((s) => (
                          <div key={`watch-${s.id}`} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-black text-foreground truncate">{s.name}</p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {s.students_placed}/{s.students_total} placed · {s.reports_published} pub
                                {s.reports_draft > 0 ? ` · ${s.reports_draft} draft` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black tabular-nums ${
                                s.health_score >= 80
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : s.health_score >= 50
                                    ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                                    : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                              }`}>
                                {s.health_score}%
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setSchoolSearch(s.name);
                                  setTab('schools');
                                }}
                                className="text-[11px] font-bold text-primary hover:underline"
                              >
                                Inspect
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
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
              {rolloverBanner && (
                <div
                  className={`rounded-xl border px-4 py-3 text-xs font-bold ${
                    rolloverBanner.type === 'success'
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                      : 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {rolloverBanner.text}
                </div>
              )}
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

                        <div className="grid grid-cols-4 gap-1.5 pt-1">
                          <div className="rounded-xl bg-muted/40 border border-border/60 px-2 py-2 text-center">
                            <div className="text-sm font-black tabular-nums text-foreground">{s.students_total}</div>
                            <div className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Students</div>
                          </div>
                          <div className="rounded-xl bg-muted/40 border border-border/60 px-2 py-2 text-center">
                            <div className="text-sm font-black tabular-nums text-foreground">{s.classes_count}</div>
                            <div className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Classes</div>
                          </div>
                          <div className="rounded-xl bg-muted/40 border border-border/60 px-2 py-2 text-center">
                            <div className="text-sm font-black tabular-nums text-emerald-700 dark:text-emerald-400">{s.reports_published}</div>
                            <div className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Published</div>
                          </div>
                          <div className="rounded-xl bg-muted/40 border border-border/60 px-2 py-2 text-center">
                            <div className="text-sm font-black tabular-nums text-foreground">{s.parent_email_pct}%</div>
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

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/70">
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
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={rolloverSchoolId === s.id}
                            onClick={() => void handleSchoolRollover(s.id, s.name)}
                            className="rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1 text-[11px] font-black text-amber-800 dark:text-amber-300 transition-colors disabled:opacity-50"
                          >
                            {rolloverSchoolId === s.id ? 'Checking…' : 'Rollover'}
                          </button>
                          <Link
                            href={`/dashboard/classes?school=${encodeURIComponent(s.name)}`}
                            className="text-xs font-bold text-muted-foreground hover:text-foreground"
                          >
                            Classes →
                          </Link>
                        </div>
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

          {/* ── UNIFIED TEACHERS & CLASSES MONITORING ─────────────────── */}
          {(tab === 'teachers' || tab === 'reports') && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm">
                <div className="flex flex-wrap items-center gap-1">
                  {([
                    { id: 'all', label: 'All Monitoring' },
                    { id: 'teachers', label: `Teachers (${teachers.length})` },
                    { id: 'classes', label: `Classes (${c?.by_class?.length ?? 0})` },
                    { id: 'backlog', label: `Draft Backlog (${c?.totals.draft ?? 0})` },
                  ] as const).map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setTeachingFocus(sub.id)}
                      className={`min-h-9 rounded-xl px-3 py-1.5 text-xs font-black transition-colors ${
                        teachingFocus === sub.id
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                      }`}
                    >
                      {sub.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 pr-1">
                  <Link
                    href="/dashboard/results"
                    className="inline-flex min-h-9 items-center rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted"
                  >
                    Publish Results →
                  </Link>
                  <Link
                    href="/dashboard/reports/builder"
                    className="inline-flex min-h-9 items-center rounded-xl bg-primary px-3 py-1.5 text-xs font-black text-primary-foreground hover:opacity-95"
                  >
                    Result Builder →
                  </Link>
                </div>
              </div>

              {(teachingFocus === 'all' || teachingFocus === 'classes' || teachingFocus === 'backlog') && (
                <Section title="Term Report Delivery Summary" icon={<ClipboardDocumentListIcon className="w-3.5 h-3.5" />}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Tile value={c?.totals.published ?? 0} label="Published Reports" tone="good" />
                    <Tile value={c?.totals.draft ?? 0} label="Unpublished Drafts" tone={(c?.totals.draft ?? 0) > 0 ? 'warn' : 'good'} onClick={() => focusFlag('draft_pending')} />
                    <Tile value={c?.classes_without_reports?.length ?? 0} label="Zero-Report Classes" tone={(c?.classes_without_reports?.length ?? 0) > 0 ? 'bad' : 'good'} />
                    <Tile value={c?.gaps.reports_missing_course ?? 0} label="Missing Course Link" tone={(c?.gaps.reports_missing_course ?? 0) > 0 ? 'warn' : 'default'} />
                  </div>
                </Section>
              )}

              {(teachingFocus === 'all' || teachingFocus === 'teachers') && <TeacherAccountabilityPanel />}

              {(teachingFocus === 'all' || teachingFocus === 'classes') && (
                <>
                  {classChartData.length > 0 && (
                    <div className={`${CARD} p-4 sm:p-5`}>
                      <h3 className={`${LABEL} mb-2`}>Class coverage — published / draft / missing</h3>
                      <StackedBarChart
                        data={classChartData}
                        xKey="class"
                        height={260}
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
                </>
              )}

              {(teachingFocus === 'all' || teachingFocus === 'backlog') && (
                <>
                  {backlog && (backlog.hidden_by_term_filter.drafts > 0 || backlog.overdue_by_teacher.length > 0) && (
                    <Section title="Unpublished draft backlog by teacher" icon={<ExclamationTriangleIcon className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />}>
                      {backlog.hidden_by_term_filter.drafts > 0 && (
                        <div className={`${CARD} p-4 text-sm text-muted-foreground`}>
                          Across all terms there are <strong className="text-foreground">{backlog.all_terms.drafts}</strong> unpublished reports —{' '}
                          <strong className="text-rose-600 dark:text-rose-400">{backlog.hidden_by_term_filter.drafts}</strong> sit outside the active term.
                        </div>
                      )}
                      {backlog.overdue_by_teacher.length > 0 && (
                        <div className={`${CARD} overflow-x-auto`}>
                          <table className="w-full text-sm min-w-[640px]">
                            <thead>
                              <tr className="border-b border-border text-left bg-muted/25">
                                {['Teacher', 'Course', 'Term', 'Unpublished', 'Oldest', 'Action'].map((h) => (
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
                                  <td className="px-3 py-2.5">
                                    <Link
                                      href="/dashboard/reports/builder"
                                      className="inline-flex items-center gap-1 rounded-lg border border-primary/35 bg-primary/10 px-2.5 py-1 text-xs font-black text-primary hover:bg-primary/20 whitespace-nowrap"
                                    >
                                      Open Reports →
                                    </Link>
                                  </td>
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
            </>
          )}

          {/* ── PARENT REACH & OFFICIAL EXPORTS ─────────────────────── */}
          {(tab === 'comms' || tab === 'report') && (
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

              <Section title="Official Accountability Exports (PDF & CSV)" icon={<ArrowDownTrayIcon className="w-3.5 h-3.5 text-primary" />}>
                <div className={`${CARD} p-5 space-y-4`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-black text-foreground">Executive Audit Pack &amp; Clean Spreadsheets</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Download the branded multi-section audit PDF or filter-ready CSV sheets for current session monitoring.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleGeneratePdf}
                      disabled={reportBusy || people.length === 0}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-black uppercase tracking-wider hover:opacity-95 disabled:opacity-50"
                    >
                      <ArrowDownTrayIcon className={`w-4 h-4 ${reportBusy ? 'animate-pulse' : ''}`} />
                      {reportBusy ? 'Building PDF…' : 'Official PDF Report'}
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadPeopleCsv(gapPeople, 'rillcod-accountability-gaps.csv')}
                      disabled={gapPeople.length === 0}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300 px-3.5 py-2 text-xs font-black uppercase tracking-wider disabled:opacity-50"
                    >
                      <ArrowDownTrayIcon className="w-4 h-4" /> Gaps CSV ({gapPeople.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadPeopleCsv(teachers, 'rillcod-accountability-teachers.csv')}
                      disabled={teachers.length === 0}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-xs font-bold hover:bg-accent disabled:opacity-50"
                    >
                      Teachers CSV ({teachers.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadPeopleCsv(students, 'rillcod-accountability-students.csv')}
                      disabled={students.length === 0}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-xs font-bold hover:bg-accent disabled:opacity-50"
                    >
                      Students CSV ({students.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadPeopleCsv(people, 'rillcod-accountability-all.csv')}
                      disabled={people.length === 0}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-xs font-bold hover:bg-accent disabled:opacity-50"
                    >
                      All Accounts CSV ({people.length})
                    </button>
                  </div>
                  {reportMsg && (
                    <p className={`text-xs font-bold ${reportMsg.startsWith('Error') ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{reportMsg}</p>
                  )}
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

      {rolloverModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Session Rollover Planner for ${rolloverModal.schoolName}`}
          className="fixed inset-0 z-[10050] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
        >
          <div className="w-full max-w-3xl max-h-[92dvh] rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-border bg-primary/5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                  Smart Session Rollover Planner · {rolloverModal.currentSession}
                </p>
                <h3 className="text-base sm:text-lg font-black text-foreground truncate">
                  {rolloverModal.schoolName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRolloverModal(null)}
                disabled={rolloverExecuting}
                className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
              {(() => {
                const active = rolloverModal.rows.filter((r) => r.enabled);
                const moving = active.filter((r) => r.action === 'promote').reduce((s, r) => s + r.student_count, 0);
                const inBand = active.filter((r) => r.action === 'upgrade_in_place').reduce((s, r) => s + r.student_count, 0);
                const graduating = active.filter((r) => r.action === 'archive_graduated').reduce((s, r) => s + r.student_count, 0);
                const inactive = active
                  .filter((r) => r.action === 'mark_inactive' || r.action === 'withdraw_terminal')
                  .reduce((s, r) => s + r.student_count, 0);
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="rounded-xl border border-primary/25 bg-primary/5 p-2.5 text-center">
                      <div className="text-lg font-black tabular-nums text-primary">{moving}</div>
                      <div className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Move to Class</div>
                    </div>
                    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-2.5 text-center">
                      <div className="text-lg font-black tabular-nums text-emerald-700 dark:text-emerald-300">{inBand}</div>
                      <div className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Upgrade in Band</div>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/40 p-2.5 text-center">
                      <div className="text-lg font-black tabular-nums text-foreground">{graduating}</div>
                      <div className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Graduate</div>
                    </div>
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-center">
                      <div className="text-lg font-black tabular-nums text-amber-800 dark:text-amber-300">{inactive}</div>
                      <div className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Mark Inactive</div>
                    </div>
                  </div>
                );
              })()}

              <label className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={rolloverModal.requireTeacherConfirmation}
                  onChange={(e) =>
                    setRolloverModal((prev) =>
                      prev ? { ...prev, requireTeacherConfirmation: e.target.checked } : prev,
                    )
                  }
                  className="mt-0.5 rounded border-border accent-primary"
                />
                <span>
                  <strong className="text-foreground">Teacher presence confirmation mode:</strong>{' '}
                  <span className="text-muted-foreground">
                    Moved students appear in the receiving teacher&apos;s class for presence confirmation; students without a next-tier class are marked inactive cleanly.
                  </span>
                </span>
              </label>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                    Top-Down Transitions ({rolloverModal.rows.filter((r) => r.enabled).length}/{rolloverModal.rows.length} selected)
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setRolloverModal((prev) =>
                          prev ? { ...prev, rows: prev.rows.map((r) => ({ ...r, enabled: true })) } : prev,
                        )
                      }
                      className="text-[11px] font-bold text-primary hover:underline"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setRolloverModal((prev) =>
                          prev ? { ...prev, rows: prev.rows.map((r) => ({ ...r, enabled: false })) } : prev,
                        )
                      }
                      className="text-[11px] font-bold text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-border divide-y divide-border">
                  {rolloverModal.rows.map((row) => {
                    const selectVal =
                      row.action === 'archive_graduated'
                        ? '__graduate__'
                        : row.action === 'withdraw_terminal'
                          ? '__withdraw__'
                          : row.action === 'mark_inactive'
                            ? '__inactive__'
                            : row.to_class_id || '__inactive__';
                    return (
                      <div
                        key={row.row_key}
                        className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                          row.enabled ? 'bg-card' : 'bg-muted/25 opacity-60'
                        }`}
                      >
                        <label className="flex items-start gap-2.5 min-w-0 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={row.enabled}
                            onChange={(e) =>
                              setRolloverModal((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      rows: prev.rows.map((r) =>
                                        r.row_key === row.row_key ? { ...r, enabled: e.target.checked } : r,
                                      ),
                                    }
                                  : prev,
                              )
                            }
                            aria-label={`Include ${row.from_class_name} ${row.from_grade}`}
                            className="mt-1 rounded border-border accent-primary"
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="text-xs font-black text-foreground truncate">
                                {row.from_class_name} · <span className="text-primary">{row.from_grade}</span>
                                {row.to_grade ? ` → ${row.to_grade}` : ''}
                              </p>
                              {row.is_terminal && (
                                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-800 dark:text-amber-300">
                                  Terminal
                                </span>
                              )}
                              {row.is_sister_school_move && (
                                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase text-emerald-800 dark:text-emerald-300">
                                  Sister School
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              {row.student_count} active student{row.student_count === 1 ? '' : 's'}
                            </p>
                          </div>
                        </label>

                        <select
                          aria-label={`Destination for ${row.from_class_name} ${row.from_grade}`}
                          disabled={!row.enabled}
                          value={selectVal}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRolloverModal((prev) => {
                              if (!prev) return prev;
                              return {
                                ...prev,
                                rows: prev.rows.map((r) => {
                                  if (r.row_key !== row.row_key) return r;
                                  if (val === '__graduate__') {
                                    return { ...r, action: 'archive_graduated', to_class_id: null, to_class_name: 'Graduated Archive' };
                                  }
                                  if (val === '__withdraw__') {
                                    return { ...r, action: 'withdraw_terminal', to_class_id: null, to_class_name: 'Withdraw / Remove from Class' };
                                  }
                                  if (val === '__inactive__') {
                                    return { ...r, action: 'mark_inactive', to_class_id: null, to_class_name: 'Mark Inactive' };
                                  }
                                  const cls = prev.availableClasses.find((c) => c.id === val);
                                  const isSame = val === r.from_class_id;
                                  return {
                                    ...r,
                                    action: isSame ? 'upgrade_in_place' : 'promote',
                                    to_class_id: val,
                                    to_class_name: cls?.name || r.to_class_name,
                                  };
                                }),
                              };
                            });
                          }}
                          className="min-h-9 sm:w-64 rounded-xl border border-border bg-background px-2.5 text-xs font-bold text-foreground disabled:opacity-50"
                        >
                          <option value="__withdraw__">Withdraw / Remove (Terminal)</option>
                          <option value="__inactive__">Mark Inactive (no next-tier class)</option>
                          <option value="__graduate__">Graduated Archive</option>
                          {rolloverModal.availableClasses.map((cls) => (
                            <option key={cls.id} value={cls.id}>
                              {cls.id === row.from_class_id ? `Upgrade in place: ${cls.name}` : `Move to: ${cls.name}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              {rolloverModal.skippedClasses.length > 0 && (
                <p className="text-[11px] text-muted-foreground rounded-xl border border-border bg-muted/25 px-3 py-2">
                  Safely untouched ({rolloverModal.skippedClasses.length} custom/non-grade class{rolloverModal.skippedClasses.length === 1 ? '' : 'es'}):{' '}
                  {rolloverModal.skippedClasses.map((s) => s.name).join(', ')}.
                </p>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-border bg-muted/20 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-muted-foreground">
                {rolloverModal.rows.filter((r) => r.enabled).reduce((s, r) => s + r.student_count, 0)} student(s) will be updated
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRolloverModal(null)}
                  disabled={rolloverExecuting}
                  className="min-h-10 rounded-xl border border-border bg-background px-4 py-2 text-xs font-bold text-foreground hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={rolloverExecuting || rolloverModal.rows.every((r) => !r.enabled)}
                  onClick={() => void executeSchoolRollover()}
                  className="min-h-10 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-5 py-2 text-xs font-black uppercase tracking-wider text-white shadow-sm disabled:opacity-50"
                >
                  {rolloverExecuting ? 'Running Rollover…' : 'Run Selected Rollover →'}
                </button>
              </div>
            </div>
          </div>
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
