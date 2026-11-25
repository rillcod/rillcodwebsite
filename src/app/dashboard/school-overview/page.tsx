// @refresh reset
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { fetchAllSupabaseRows } from '@/lib/supabase/fetch-all-rows';
import {
  classifyStudentSessionStatus,
  getSessionBoundary,
  shouldReplaceRosterRow,
  type StudentSessionStatus,
} from '@/lib/academic/session-scope';
import { coverageSessionOrFilter } from '@/lib/reports/academic-period';
import { measuredAttendancePercentage } from '@/lib/attendance/policy';
import Link from 'next/link';
import {
  UserGroupIcon,
  AcademicCapIcon,
  TrophyIcon,
  DocumentArrowDownIcon,
  ClipboardDocumentCheckIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  BuildingOffice2Icon,
} from '@/lib/icons';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DonutChart as RechartDonut, HorizontalBarChart, SparkCard, CHART_COLORS } from '@/components/charts';

interface SchoolOption {
  id: string;
  name: string;
}

interface StudentRow {
  id: string;
  full_name: string;
  email: string;
  class_id: string | null;
  class_label: string;
  session_status: StudentSessionStatus;
  avgGrade: number | null;
  scoreSource: 'report' | 'assignments' | 'none';
  publishedReports: number;
  attendance: number | null;
  submissions: number;
}

interface ClassSummaryRow {
  name: string;
  learnerCount: number;
  scoredCount: number;
  avgScore: number;
  avgAttendance: number | null;
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) {
    return (
      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground">
        Pending
      </span>
    );
  }
  const color =
    score >= 75
      ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-500/15'
      : score >= 50
        ? 'text-amber-700 dark:text-amber-300 bg-amber-500/15'
        : 'text-rose-700 dark:text-rose-300 bg-rose-500/15';
  return <span className={`text-xs font-black px-2.5 py-0.5 rounded-full tabular-nums ${color}`}>{Math.round(score)}%</span>;
}

function AttendanceText({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="text-xs font-medium text-muted-foreground">Not recorded</span>;
  }
  const color =
    value >= 75
      ? 'text-emerald-700 dark:text-emerald-300'
      : value >= 50
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-rose-700 dark:text-rose-300';
  return <span className={`text-xs font-bold tabular-nums ${color}`}>{value}%</span>;
}

export default function SchoolOverviewPage() {
  const { profile, loading: authLoading } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const isSchool = profile?.role === 'school';

  const [schoolOptions, setSchoolOptions] = useState<SchoolOption[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('');
  const [resolvedSchoolName, setResolvedSchoolName] = useState<string>('');
  const [allStudentRows, setAllStudentRows] = useState<StudentRow[]>([]);
  const [classNames, setClassNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [scopeFilter, setScopeFilter] = useState<'current' | 'all'>('current');
  const [sortBy, setSortBy] = useState<'grade' | 'attendance' | 'name'>('grade');

  const sessionBoundary = useMemo(() => getSessionBoundary(), []);

  useEffect(() => {
    if (authLoading || !profile) return;
    if (!isSchool && !isAdmin) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      const supabase = createClient();
      if (isSchool && profile.school_id) {
        setSelectedSchoolId(profile.school_id);
        setResolvedSchoolName(profile.school_name || 'Partner School');
        return;
      }
      if (isAdmin) {
        const { data } = await supabase
          .from('schools')
          .select('id, name')
          .eq('status', 'approved')
          .order('name', { ascending: true })
          .limit(500);
        if (cancelled) return;
        const list = ((data ?? []) as SchoolOption[]).filter((s) => s.id && s.name);
        setSchoolOptions(list);
        const initialId = profile.school_id || list[0]?.id || '';
        setSelectedSchoolId(initialId);
        const matched = list.find((s) => s.id === initialId);
        setResolvedSchoolName(matched?.name || profile.school_name || 'Partner School');
      } else {
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, profile?.id, profile?.role, profile?.school_id, profile?.school_name, isAdmin, isSchool]);

  useEffect(() => {
    if (authLoading || !profile) return;
    if (!isSchool && !isAdmin) return;
    if (!selectedSchoolId && !profile.school_name) return;
    void loadPerformance(selectedSchoolId, profile.school_name ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSchoolId, authLoading, profile?.id]);

  async function loadPerformance(schoolId: string, fallbackSchoolName: string | null) {
    setLoading(true);
    const supabase = createClient();

    if (schoolId && schoolOptions.length > 0) {
      const matched = schoolOptions.find((s) => s.id === schoolId);
      if (matched) setResolvedSchoolName(matched.name);
    } else if (schoolId && !resolvedSchoolName) {
      const { data: schoolRow } = await supabase
        .from('schools')
        .select('name')
        .eq('id', schoolId)
        .maybeSingle();
      if (schoolRow?.name) setResolvedSchoolName(schoolRow.name);
    }

    const [portalStudentsRes, classesResult] = await Promise.all([
      fetchAllSupabaseRows<any>((from: number, to: number) => {
        let q = supabase
          .from('portal_users')
          .select('id, full_name, email, class_id, section_class, is_active, created_at, metadata')
          .eq('role', 'student')
          .eq('is_active', true)
          .or('is_deleted.is.null,is_deleted.eq.false');
        if (schoolId) q = q.eq('school_id', schoolId);
        else if (fallbackSchoolName) q = q.eq('school_name', fallbackSchoolName);
        return q.range(from, to);
      }),
      schoolId
        ? supabase.from('classes').select('id, name').eq('school_id', schoolId).limit(500)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    ]);

    const portalStudents = portalStudentsRes.data;
    const classMap = new Map<string, string>(
      ((classesResult.data ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name || 'Unnamed Class']),
    );

    if (!portalStudents.length) {
      setAllStudentRows([]);
      setClassNames([]);
      setLoading(false);
      return;
    }

    const ids = portalStudents.map((s) => s.id as string);
    const liveClassByStudent = new Map(portalStudents.map((s) => [s.id as string, (s.class_id as string | null) ?? null]));

    // Chunked lookups to prevent URL-length or PostgREST 1,000-row truncation.
    const latestRosterByStudent = new Map<string, any>();
    const legacyIdToPortalId = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const [rosterChunkRes, legacyChunk] = await Promise.all([
        fetchAllSupabaseRows<any>((from: number, to: number) =>
          supabase
            .from('class_term_rosters')
            .select('student_id, class_id, term_id, status, started_at, reinstated_at, ended_at')
            .in('student_id', chunk)
            .range(from, to),
        ),
        supabase.from('students').select('id, user_id').in('user_id', chunk),
      ]);
      for (const row of rosterChunkRes.data) {
        if (!row?.student_id) continue;
        const existing = latestRosterByStudent.get(row.student_id);
        if (shouldReplaceRosterRow(existing, row, liveClassByStudent.get(row.student_id))) {
          latestRosterByStudent.set(row.student_id, row);
        }
      }
      for (const row of (legacyChunk.data ?? []) as Array<{ id?: string; user_id?: string }>) {
        if (row?.id && row?.user_id) legacyIdToPortalId.set(row.id, row.user_id);
      }
    }

    const { resolveAssignmentTermId, filterByAssignmentSession } = await import('@/lib/assignments/session');
    const liveTermId = await resolveAssignmentTermId(supabase as any, {});
    const sessionOr = coverageSessionOrFilter({
      termId: liveTermId,
      termLabel: sessionBoundary.termLabel,
      periodLabel: sessionBoundary.periodLabel,
    });

    const allSubs: any[] = [];
    const allAtt: any[] = [];
    const allReports: any[] = [];

    for (let i = 0; i < ids.length; i += 150) {
      const chunk = ids.slice(i, i + 150);
      const legacyForChunk = [...legacyIdToPortalId.entries()]
        .filter(([, portalId]) => chunk.includes(portalId))
        .map(([legacyId]) => legacyId);
      const attIdList = [...new Set([...chunk, ...legacyForChunk])].join(',');
      const chunkList = chunk.join(',');

      let attQ = supabase
        .from('attendance')
        .select('user_id, student_id, status, term_id, created_at')
        .or(`user_id.in.(${attIdList}),student_id.in.(${attIdList})`)
        .limit(5000);
      if (liveTermId) {
        attQ = attQ.or(`term_id.eq.${liveTermId},term_id.is.null`) as typeof attQ;
      }

      let repQ = supabase
        .from('student_progress_reports')
        .select('student_id, overall_score, participation_score, is_published, report_term, academic_year, term_id')
        .in('student_id', chunk)
        .eq('is_published', true)
        .limit(2000);
      if (schoolId) repQ = repQ.eq('school_id', schoolId);
      if (sessionOr) repQ = repQ.or(sessionOr) as typeof repQ;

      const [subsRes, attRes, repRes] = await Promise.all([
        supabase
          .from('assignment_submissions')
          .select('portal_user_id, user_id, grade, status, assignments(term_id)')
          .or(`portal_user_id.in.(${chunkList}),user_id.in.(${chunkList})`)
          .limit(5000),
        attQ,
        repQ,
      ]);

      if (subsRes.data?.length) allSubs.push(...subsRes.data);
      if (attRes.data?.length) allAtt.push(...attRes.data);
      if (repRes.data?.length) allReports.push(...repRes.data);
    }

    const subs = filterByAssignmentSession(allSubs, liveTermId);
    const sessionStartMs = sessionBoundary.sessionStartMs;
    const attRows = allAtt.filter((row) => {
      if (liveTermId && row.term_id === liveTermId) return true;
      if (liveTermId && row.term_id && row.term_id !== liveTermId) return false;
      const createdMs = row.created_at ? Date.parse(row.created_at) : NaN;
      return Number.isFinite(createdMs) ? createdMs >= sessionStartMs : true;
    });

    const subsByStudent = new Map<string, number[]>();
    for (const sub of subs) {
      const sid = sub.portal_user_id || sub.user_id;
      if (!sid || sub.grade == null) continue;
      const list = subsByStudent.get(sid) ?? [];
      list.push(Number(sub.grade));
      subsByStudent.set(sid, list);
    }

    const reportsByStudent = new Map<string, { scores: number[]; participation: number[] }>();
    for (const rep of allReports) {
      const sid = rep.student_id as string | undefined;
      if (!sid) continue;
      const entry = reportsByStudent.get(sid) ?? { scores: [], participation: [] };
      if (rep.overall_score != null && Number.isFinite(Number(rep.overall_score))) {
        entry.scores.push(Number(rep.overall_score));
      }
      if (rep.participation_score != null && Number.isFinite(Number(rep.participation_score))) {
        entry.participation.push(Number(rep.participation_score));
      }
      reportsByStudent.set(sid, entry);
    }

    const attByStudent = new Map<string, string[]>();
    for (const att of attRows) {
      const sid = (att.user_id as string | null) || (att.student_id ? legacyIdToPortalId.get(att.student_id) : null);
      if (!sid || !att.status) continue;
      const list = attByStudent.get(sid) ?? [];
      list.push(String(att.status));
      attByStudent.set(sid, list);
    }

    const builtRows: StudentRow[] = [];
    for (const s of portalStudents) {
      const rosterRow = latestRosterByStudent.get(s.id);
      const sessionStatus = classifyStudentSessionStatus(s, rosterRow, {
        canonicalTermId: liveTermId,
        boundary: sessionBoundary,
      });
      if (sessionStatus === 'withdrawn') continue;

      const repEntry = reportsByStudent.get(s.id);
      const subGrades = subsByStudent.get(s.id) ?? [];

      let avgGrade: number | null = null;
      let scoreSource: StudentRow['scoreSource'] = 'none';
      if (repEntry && repEntry.scores.length > 0) {
        avgGrade = repEntry.scores.reduce((a, b) => a + b, 0) / repEntry.scores.length;
        scoreSource = 'report';
      } else if (subGrades.length > 0) {
        avgGrade = subGrades.reduce((a, b) => a + b, 0) / subGrades.length;
        scoreSource = 'assignments';
      }

      const rollStatuses = attByStudent.get(s.id) ?? [];
      const measuredRoll = measuredAttendancePercentage(rollStatuses);
      let attendance: number | null = measuredRoll == null ? null : Math.round(measuredRoll);
      if (attendance == null && repEntry && repEntry.participation.length > 0) {
        attendance = Math.round(
          repEntry.participation.reduce((a, b) => a + b, 0) / repEntry.participation.length,
        );
      }

      const effectiveStatus: StudentSessionStatus =
        sessionStatus === 'carryover_unconfirmed' && (avgGrade != null || attendance != null)
          ? 'confirmed_current'
          : sessionStatus;

      const resolvedClassId = (s.class_id as string | null) || (rosterRow?.class_id as string | null) || null;
      const classLabel =
        (resolvedClassId && classMap.get(resolvedClassId)) ||
        (s.section_class ? String(s.section_class) : 'Unassigned');

      builtRows.push({
        id: s.id,
        full_name: s.full_name || 'Unnamed Learner',
        email: s.email || '',
        class_id: resolvedClassId,
        class_label: classLabel,
        session_status: effectiveStatus,
        avgGrade,
        scoreSource,
        publishedReports: repEntry?.scores.length ?? 0,
        attendance,
        submissions: subGrades.length,
      });
    }

    const distinctClasses = Array.from(
      new Set(builtRows.map((r) => r.class_label).filter((c) => c && c !== 'Unassigned')),
    ).sort((a, b) => a.localeCompare(b));

    setClassNames(distinctClasses);
    setAllStudentRows(builtRows);
    setLoading(false);
  }

  const confirmedRows = useMemo(
    () => allStudentRows.filter((r) => r.session_status === 'confirmed_current'),
    [allStudentRows],
  );
  const unconfirmedCount = allStudentRows.length - confirmedRows.length;

  const scopedStudents = useMemo(
    () => (scopeFilter === 'current' ? confirmedRows : allStudentRows),
    [scopeFilter, confirmedRows, allStudentRows],
  );

  const stats = useMemo(() => {
    const scored = scopedStudents.filter((s) => s.avgGrade != null);
    const avgScore = scored.length
      ? scored.reduce((sum, s) => sum + (s.avgGrade ?? 0), 0) / scored.length
      : 0;
    const measured = scopedStudents.filter((s) => s.attendance != null);
    const avgAttendance = measured.length
      ? measured.reduce((sum, s) => sum + (s.attendance ?? 0), 0) / measured.length
      : 0;
    const withPublishedReport = scopedStudents.filter((s) => s.publishedReports > 0).length;
    return {
      active: scopedStudents.length,
      scoredCount: scored.length,
      avgScore,
      measuredAttendanceCount: measured.length,
      avgAttendance,
      withPublishedReport,
    };
  }, [scopedStudents]);

  const classSummaries = useMemo<ClassSummaryRow[]>(() => {
    const byClass = new Map<string, StudentRow[]>();
    for (const row of scopedStudents) {
      const list = byClass.get(row.class_label) ?? [];
      list.push(row);
      byClass.set(row.class_label, list);
    }
    return [...byClass.entries()]
      .map(([name, members]) => {
        const scored = members.filter((m) => m.avgGrade != null);
        const measured = members.filter((m) => m.attendance != null);
        return {
          name,
          learnerCount: members.length,
          scoredCount: scored.length,
          avgScore: scored.length
            ? Math.round(scored.reduce((s, m) => s + (m.avgGrade ?? 0), 0) / scored.length)
            : 0,
          avgAttendance: measured.length
            ? Math.round(measured.reduce((s, m) => s + (m.attendance ?? 0), 0) / measured.length)
            : null,
        };
      })
      .sort((a, b) => b.avgScore - a.avgScore || b.learnerCount - a.learnerCount);
  }, [scopedStudents]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedStudents
      .filter((s) => {
        if (classFilter !== 'all' && s.class_label !== classFilter) return false;
        if (!q) return true;
        return (
          s.full_name.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q) ||
          s.class_label.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'grade') return (b.avgGrade ?? -1) - (a.avgGrade ?? -1);
        if (sortBy === 'attendance') return (b.attendance ?? -1) - (a.attendance ?? -1);
        return a.full_name.localeCompare(b.full_name);
      });
  }, [scopedStudents, classFilter, search, sortBy]);

  function exportPDF() {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`${resolvedSchoolName || 'School'} — Performance Summary`, 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(
      `${sessionBoundary.termLabel} · ${sessionBoundary.periodLabel} · ${filtered.length} learners · Generated ${new Date().toLocaleDateString()}`,
      14,
      28,
    );

    autoTable(doc, {
      startY: 35,
      head: [['Learner', 'Class / Section', 'Term Score', 'Attendance', 'Evidence']],
      body: filtered.map((s) => [
        s.full_name,
        s.class_label,
        s.avgGrade == null ? 'Pending' : `${Math.round(s.avgGrade)}%`,
        s.attendance == null ? 'Not recorded' : `${s.attendance}%`,
        s.publishedReports > 0
          ? `${s.publishedReports} report${s.publishedReports === 1 ? '' : 's'}`
          : s.submissions > 0
            ? `${s.submissions} task${s.submissions === 1 ? '' : 's'}`
            : '—',
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 41, 59] },
    });

    const slug = (resolvedSchoolName || 'school')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    doc.save(`${slug}-performance-${sessionBoundary.periodLabel.replace('/', '-')}.pdf`);
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center mobile-page-root">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isSchool && !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center mobile-page-root">
        <p className="text-muted-foreground">Access restricted to partner schools and administrators.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-5 sm:px-6 lg:px-8 mobile-page-root max-w-7xl mx-auto space-y-6">
      {/* Unified Header */}
      <header className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-primary">
                <BuildingOffice2Icon className="w-3.5 h-3.5" />
                School Performance
              </span>
              <span>
                {sessionBoundary.termLabel} · {sessionBoundary.periodLabel}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight truncate">
                {resolvedSchoolName || profile?.school_name || 'Partner School'}
              </h1>
              {isAdmin && schoolOptions.length > 0 && (
                <select
                  aria-label="Select partner school"
                  value={selectedSchoolId}
                  onChange={(e) => {
                    setSelectedSchoolId(e.target.value);
                    setClassFilter('all');
                  }}
                  className="min-h-10 rounded-xl border border-border bg-background px-3 py-1.5 text-sm font-semibold text-foreground focus:border-primary focus:outline-none"
                >
                  {schoolOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Live session standing across published term reports, graded coursework, and class attendance.
            </p>
          </div>

          {/* Consolidated Action Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/dashboard/school-reports"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs sm:text-sm font-bold text-primary-foreground shadow-sm hover:opacity-95 transition-opacity"
            >
              <BookOpenIcon className="w-4 h-4 shrink-0" />
              <span>School Report Books</span>
            </Link>
            <Link
              href="/dashboard/results"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-foreground hover:bg-muted/60 transition-colors"
            >
              <DocumentTextIcon className="w-4 h-4 shrink-0" />
              <span>Student Results</span>
            </Link>
            <button
              type="button"
              onClick={exportPDF}
              disabled={filtered.length === 0}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-foreground hover:bg-muted/60 disabled:opacity-50 transition-colors"
            >
              <DocumentArrowDownIcon className="w-4 h-4 shrink-0" />
              <span>Export PDF</span>
            </button>
            {selectedSchoolId && (
              <Link
                href={`/dashboard/timetable?school_id=${selectedSchoolId}`}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2.5 text-xs sm:text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                title="View school timetable"
              >
                <CalendarDaysIcon className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Schedule</span>
              </Link>
            )}
          </div>
        </div>

        {/* Session Scope Pill (shown only when unconfirmed prior-session records exist) */}
        {unconfirmedCount > 0 && (
          <div className="mt-4 pt-3 border-t border-border flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">
              Showing confirmed <strong className="text-foreground">{sessionBoundary.periodLabel}</strong> learners by default ({unconfirmedCount} unconfirmed prior-term record{unconfirmedCount === 1 ? '' : 's'} hidden).
            </span>
            <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
              <button
                type="button"
                onClick={() => setScopeFilter('current')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${
                  scopeFilter === 'current'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Confirmed ({confirmedRows.length})
              </button>
              <button
                type="button"
                onClick={() => setScopeFilter('all')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${
                  scopeFilter === 'all'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All Records ({allStudentRows.length})
              </button>
            </div>
          </div>
        )}
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <SparkCard
          label="Confirmed Learners"
          value={stats.active}
          subValue={`${classSummaries.length} active class${classSummaries.length === 1 ? '' : 'es'}`}
          color={CHART_COLORS.blue}
          icon={UserGroupIcon}
          sparkData={[Math.max(0, stats.active - 4), Math.max(0, stats.active - 2), stats.active]}
        />
        <SparkCard
          label="Average Score"
          value={stats.scoredCount > 0 ? `${Math.round(stats.avgScore)}%` : '—'}
          subValue={`${stats.scoredCount} of ${stats.active} graded`}
          color={CHART_COLORS.amber}
          icon={TrophyIcon}
          sparkData={[50, Math.round(stats.avgScore * 0.9), Math.round(stats.avgScore)]}
        />
        <SparkCard
          label="Attendance Rate"
          value={stats.measuredAttendanceCount > 0 ? `${Math.round(stats.avgAttendance)}%` : '—'}
          subValue={`${stats.measuredAttendanceCount} measured`}
          color={CHART_COLORS.emerald}
          icon={ClipboardDocumentCheckIcon}
          sparkData={[65, Math.round(stats.avgAttendance * 0.92), Math.round(stats.avgAttendance)]}
        />
        <SparkCard
          label="Published Reports"
          value={stats.withPublishedReport}
          subValue={
            stats.active > 0
              ? `${Math.round((stats.withPublishedReport / stats.active) * 100)}% report coverage`
              : 'No learners yet'
          }
          color={CHART_COLORS.violet}
          icon={AcademicCapIcon}
          sparkData={[0, Math.round(stats.withPublishedReport * 0.6), stats.withPublishedReport]}
        />
      </div>

      {/* Analytics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-card border border-border p-4 sm:p-5 space-y-3">
          <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Score Bands</p>
          <RechartDonut
            data={[
              {
                label: 'Excellent (75%+)',
                color: CHART_COLORS.emerald,
                value: scopedStudents.filter((s) => s.avgGrade != null && s.avgGrade >= 75).length,
              },
              {
                label: 'Good (50–74%)',
                color: CHART_COLORS.amber,
                value: scopedStudents.filter((s) => s.avgGrade != null && s.avgGrade >= 50 && s.avgGrade < 75).length,
              },
              {
                label: 'Needs Support (<50%)',
                color: CHART_COLORS.rose,
                value: scopedStudents.filter((s) => s.avgGrade != null && s.avgGrade < 50).length,
              },
              {
                label: 'Pending Assessment',
                color: '#64748b',
                value: scopedStudents.filter((s) => s.avgGrade == null).length,
              },
            ]}
            centerLabel="Avg Score"
            centerValue={stats.scoredCount > 0 ? `${Math.round(stats.avgScore)}%` : '—'}
            height={190}
            innerRadius={52}
            outerRadius={78}
          />
        </div>

        <div className="rounded-2xl bg-card border border-border p-4 sm:p-5 space-y-3">
          <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Attendance Bands</p>
          <RechartDonut
            data={[
              {
                label: 'Strong (75%+)',
                color: CHART_COLORS.blue,
                value: scopedStudents.filter((s) => s.attendance != null && s.attendance >= 75).length,
              },
              {
                label: 'Moderate (50–74%)',
                color: CHART_COLORS.violet,
                value: scopedStudents.filter((s) => s.attendance != null && s.attendance >= 50 && s.attendance < 75).length,
              },
              {
                label: 'At Risk (<50%)',
                color: CHART_COLORS.rose,
                value: scopedStudents.filter((s) => s.attendance != null && s.attendance < 50).length,
              },
              {
                label: 'Not Recorded',
                color: '#64748b',
                value: scopedStudents.filter((s) => s.attendance == null).length,
              },
            ]}
            centerLabel="Attendance"
            centerValue={stats.measuredAttendanceCount > 0 ? `${Math.round(stats.avgAttendance)}%` : '—'}
            height={190}
            innerRadius={52}
            outerRadius={78}
          />
        </div>

        {/* Top Performers */}
        <div className="rounded-2xl bg-card border border-border p-4 sm:p-5">
          <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-3">Top Performers</p>
          {stats.scoredCount === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              Scores will appear once term reports or graded tasks are published.
            </p>
          ) : (
            <div className="space-y-3">
              {[...scopedStudents]
                .filter((s) => s.avgGrade != null)
                .sort((a, b) => (b.avgGrade ?? 0) - (a.avgGrade ?? 0))
                .slice(0, 5)
                .map((s, i) => (
                  <div key={s.id} className="flex items-center gap-3">
                    <span
                      className={`text-xs font-black w-5 text-center shrink-0 ${
                        i === 0
                          ? 'text-amber-600 dark:text-amber-400'
                          : i === 1
                            ? 'text-slate-500 dark:text-slate-300'
                            : i === 2
                              ? 'text-orange-600 dark:text-orange-400'
                              : 'text-muted-foreground'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                      <span className="text-[11px] font-black">{s.full_name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">{s.full_name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{s.class_label}</p>
                    </div>
                    <ScoreBadge score={s.avgGrade} />
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Class Breakdown */}
      {classSummaries.length > 0 && (
        <section className="rounded-2xl bg-card border border-border p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="text-xs font-black text-muted-foreground uppercase tracking-widest">
                Class Performance Breakdown
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tap a class pill below to filter the learner directory.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setClassFilter('all')}
                className={`min-h-9 rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                  classFilter === 'all'
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-background text-muted-foreground hover:text-foreground'
                }`}
              >
                All Classes ({scopedStudents.length})
              </button>
              {classSummaries.map((cls) => (
                <button
                  key={cls.name}
                  type="button"
                  onClick={() => setClassFilter(cls.name === classFilter ? 'all' : cls.name)}
                  className={`min-h-9 rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                    classFilter === cls.name
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {cls.name} ({cls.learnerCount})
                </button>
              ))}
            </div>
          </div>

          {classSummaries.some((c) => c.scoredCount > 0) && (
            <HorizontalBarChart
              data={classSummaries.slice(0, 12).map((c) => ({
                label: `${c.name} (${c.learnerCount})`,
                value: c.avgScore,
                color:
                  c.avgScore >= 75
                    ? CHART_COLORS.emerald
                    : c.avgScore >= 50
                      ? CHART_COLORS.amber
                      : CHART_COLORS.rose,
              }))}
              formatValue={(v) => `${v}%`}
            />
          )}
        </section>
      )}

      {/* Responsive Learner Directory */}
      <section className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 sm:p-5 border-b border-border gap-3">
          <div>
            <h2 className="text-xs font-black text-muted-foreground uppercase tracking-widest">
              Learner Directory ({filtered.length})
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:flex-initial min-w-[180px]">
              <MagnifyingGlassIcon className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                aria-label="Search students"
                type="search"
                placeholder="Search learner or class..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:w-56 min-h-10 bg-background border border-border text-foreground text-sm pl-9 pr-3 py-1.5 rounded-xl placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              />
            </div>
            {classNames.length > 0 && (
              <select
                aria-label="Filter by class"
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="min-h-10 bg-background border border-border text-foreground text-sm px-3 py-1.5 rounded-xl focus:outline-none focus:border-primary"
              >
                <option value="all">All classes</option>
                {classNames.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
            <select
              aria-label="Sort learners"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'grade' | 'attendance' | 'name')}
              className="min-h-10 bg-background border border-border text-foreground text-sm px-3 py-1.5 rounded-xl focus:outline-none focus:border-primary"
            >
              <option value="grade">Sort: Score</option>
              <option value="attendance">Sort: Attendance</option>
              <option value="name">Sort: Name</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 px-4 text-sm text-muted-foreground">
            No learners match this filter.
          </div>
        ) : (
          <>
            {/* Mobile Card List */}
            <div className="divide-y divide-border md:hidden">
              {filtered.map((s) => (
                <div key={s.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground truncate">{s.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {s.class_label}
                      {s.publishedReports > 0
                        ? ` · ${s.publishedReports} term report${s.publishedReports === 1 ? '' : 's'}`
                        : s.submissions > 0
                          ? ` · ${s.submissions} graded task${s.submissions === 1 ? '' : 's'}`
                          : ''}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <ScoreBadge score={s.avgGrade} />
                    <AttendanceText value={s.attendance} />
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-[11px] font-bold uppercase tracking-wider bg-muted/20">
                    <th className="text-left px-5 py-3">Learner</th>
                    <th className="text-left px-4 py-3">Class / Section</th>
                    <th className="text-center px-4 py-3">Term Score</th>
                    <th className="text-center px-4 py-3">Attendance</th>
                    <th className="text-center px-5 py-3">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((s) => (
                    <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                            <span className="text-xs font-black">{s.full_name.charAt(0)}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-foreground font-semibold truncate">{s.full_name}</p>
                            {s.email && <p className="text-muted-foreground text-xs truncate">{s.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-medium">{s.class_label}</td>
                      <td className="px-4 py-3 text-center">
                        <ScoreBadge score={s.avgGrade} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <AttendanceText value={s.attendance} />
                      </td>
                      <td className="px-5 py-3 text-center text-xs text-muted-foreground">
                        {s.publishedReports > 0 ? (
                          <span className="font-semibold text-foreground">
                            {s.publishedReports} published report{s.publishedReports === 1 ? '' : 's'}
                          </span>
                        ) : s.submissions > 0 ? (
                          <span>
                            {s.submissions} graded task{s.submissions === 1 ? '' : 's'}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
