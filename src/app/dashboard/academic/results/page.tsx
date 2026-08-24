'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AutoFillClassSummary,
  AutoFillFlowGuide,
  AutoFillLearnerContext,
  AutoFillReadinessPanel,
  buildAutoFillReadiness,
  formatReportScoreDisplay,
  type AutoFillReport,
} from '@/components/reports/AutoFillWorkspace';
import { ResultStatusBadges } from '@/components/reports/ResultStatusBadges';
import { LearnerReportFlowStrip, learnerReportHref } from '@/components/reports/LearnerReportFlowStrip';
import { formatClassRowOptionLabel, ReportSessionContextBanner } from '@/components/reports/ReportSessionContextBanner';
import { autoFillResultMessage, automaticResultHasNoEvidence } from '@/lib/reports/score';
import {
  classSessionFromTerms,
  reportMatchesClassSession,
  sessionFromReport,
} from '@/lib/reports/session-scope';
import { buildClassTeachingHref } from '@/lib/curriculum/href';
import { MOBILE_PAGE_BOTTOM } from '@/components/mobile/mobile-styles';

type Klass = {
  id: string;
  name: string;
  academic_offering_id?: string | null;
  offering_period_id?: string | null;
  schools?: { programme_standing?: string | null } | null;
  academic_offerings?: { title: string; enrollment_type: string; academic_model: string } | null;
  academic_offering_periods?: { label: string } | null;
  academic_terms?: { term_label: string; academic_year: string } | null;
};
type Student = { id: string; full_name: string; class_id: string; enrollment_type: string };
type Plan = { id: string; class_id: string; course_id: string; curriculum_release_id: string | null; courses?: { title: string } | null };
type Data = { classes: Klass[]; students: Student[]; plans: Plan[]; reports: AutoFillReport[] };

const enrollmentLabel: Record<string, string> = {
  school: 'Regular School',
  online: 'Virtual School',
  special: 'Special Programme',
  in_person: 'Special Programme (in person)',
};

type ListFilter = 'all' | 'manual' | 'automatic' | 'draft' | 'published' | 'no_evidence';
type MessageTone = 'success' | 'warning' | 'neutral';

export default function CentralResultsPage() {
  return (
    <Suspense fallback={null}>
      <CentralResultsPageInner />
    </Suspense>
  );
}

function CentralResultsPageInner() {
  const searchParams = useSearchParams();
  const linkedClassId = searchParams.get('class_id') ?? '';
  const linkedCourseId = searchParams.get('course_id') ?? '';
  const linkedStudentId = searchParams.get('student') ?? '';
  const linkedReportId = searchParams.get('report') ?? '';

  const [data, setData] = useState<Data>({ classes: [], students: [], plans: [], reports: [] });
  const [classId, setClassId] = useState(linkedClassId);
  const [studentId, setStudentId] = useState(linkedStudentId);
  const [courseId, setCourseId] = useState(linkedCourseId);
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [search, setSearch] = useState('');
  const [openingTyped, setOpeningTyped] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, filled: 0, empty: 0, skipped: 0 });
  const [recalcId, setRecalcId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<MessageTone>('neutral');
  const [reportId, setReportId] = useState('');
  const [listLimit, setListLimit] = useState(60);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/academic-spine/results', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to open results.');
      setData(body.data);
      setError('');
      if (linkedClassId) setClassId((current) => current || linkedClassId);
      if (linkedCourseId) setCourseId((current) => current || linkedCourseId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to open results. Please try again.');
    }
  }, [linkedClassId, linkedCourseId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => { if (linkedClassId) setClassId(linkedClassId); }, [linkedClassId]);
  useEffect(() => { if (linkedCourseId) setCourseId(linkedCourseId); }, [linkedCourseId]);
  useEffect(() => { if (linkedStudentId) setStudentId(linkedStudentId); }, [linkedStudentId]);

  useEffect(() => {
    if (!linkedReportId) return;
    const report = data.reports.find((item) => item.id === linkedReportId);
    if (!report) return;
    if (report.class_id) setClassId(report.class_id);
    if (report.student_id) setStudentId(report.student_id);
    if (report.course_id) setCourseId(report.course_id);
    setReportId(linkedReportId);
  }, [linkedReportId, data.reports]);

  const activeClass = data.classes.find((item) => item.id === classId);
  const compulsorySchoolPapers = activeClass?.schools?.programme_standing === 'compulsory';
  const students = useMemo(() => data.students.filter((item) => item.class_id === classId), [data.students, classId]);
  const plans = useMemo(() => data.plans.filter((item) => item.class_id === classId), [data.plans, classId]);
  const courseOptions = useMemo(
    () => [...new Map(plans.map((plan) => [plan.course_id, plan])).values()],
    [plans],
  );
  const selectedStudent = students.find((item) => item.id === studentId);
  const selectedPlan = courseOptions.find((item) => item.course_id === courseId);

  useEffect(() => {
    if (!classId) return;
    setCourseId((current) => {
      if (current && courseOptions.some((plan) => plan.course_id === current)) return current;
      return courseOptions.length === 1 ? courseOptions[0].course_id : '';
    });
  }, [classId, courseOptions]);

  const classSession = useMemo(
    () => classSessionFromTerms(activeClass?.academic_terms),
    [activeClass],
  );

  const sessionScopedReports = useMemo(() => {
    if (!classSession) return data.reports;
    return data.reports.filter((report) => reportMatchesClassSession(report, activeClass));
  }, [data.reports, classSession, activeClass]);

  useEffect(() => {
    if (!classId || students.length === 0) return;
    setStudentId((current) => {
      if (current && students.some((student) => student.id === current)) return current;
      const learnerWithoutResult = courseId
        ? students.find((student) => !sessionScopedReports.some((report) =>
            report.student_id === student.id && report.course_id === courseId,
          ))
        : null;
      return learnerWithoutResult?.id ?? students[0].id;
    });
  }, [classId, courseId, courseOptions, sessionScopedReports, students]);

  const selectedReport = useMemo(() => {
    const matches = sessionScopedReports.filter(
      (report) => report.student_id === studentId && report.course_id === courseId,
    );
    return matches.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0] ?? null;
  }, [sessionScopedReports, studentId, courseId]);

  const autoFillWorkingSession = classSession ?? { term: '', period: '' };

  const readiness = useMemo(
    () => buildAutoFillReadiness({
      classId,
      studentId,
      courseId,
      activeClass,
      selectedStudent,
      selectedPlan,
    }),
    [classId, studentId, courseId, activeClass, selectedStudent, selectedPlan],
  );
  const readyToFill = readiness.every((item) => item.ok);

  const classStudentIds = useMemo(() => new Set(students.map((s) => s.id)), [students]);

  const visibleReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessionScopedReports.filter((report) => {
      if (classId) {
        const inSelectedClass =
          report.class_id === classId ||
          (!!report.student_id && classStudentIds.has(report.student_id));
        if (!inSelectedClass) return false;
      }
      if (courseId && report.course_id !== courseId) return false;
      if (listFilter === 'manual' && report.calculation_mode !== 'manual') return false;
      if (listFilter === 'automatic' && report.calculation_mode !== 'automatic') return false;
      if (listFilter === 'draft' && report.is_published) return false;
      if (listFilter === 'published' && !report.is_published) return false;
      if (listFilter === 'no_evidence' && !automaticResultHasNoEvidence(report)) return false;
      if (!q) return true;
      return `${report.student_name} ${report.course_name} ${report.report_term} ${report.report_period}`
        .toLowerCase()
        .includes(q);
    });
  }, [sessionScopedReports, classId, classStudentIds, courseId, listFilter, search]);

  const counts = useMemo(() => {
    const scoped = sessionScopedReports.filter((r) => {
      const inClass = !classId || r.class_id === classId || (!!r.student_id && classStudentIds.has(r.student_id));
      const inCourse = !courseId || r.course_id === courseId;
      return inClass && inCourse;
    });
    return {
      all: scoped.length,
      manual: scoped.filter((r) => r.calculation_mode === 'manual').length,
      automatic: scoped.filter((r) => r.calculation_mode === 'automatic').length,
      draft: scoped.filter((r) => !r.is_published).length,
      published: scoped.filter((r) => r.is_published).length,
      no_evidence: scoped.filter((r) => automaticResultHasNoEvidence(r)).length,
    };
  }, [sessionScopedReports, classId, classStudentIds, courseId]);

  const bulkTargets = useMemo(() => students.filter((student) => {
    const existing = sessionScopedReports.find((report) => report.student_id === student.id && report.course_id === courseId);
    if (!existing) return true;
    if (existing.is_published) return false;
    if (existing.calculation_mode === 'manual') return false;
    return true;
  }), [students, sessionScopedReports, courseId]);

  function setFeedback(text: string, tone: MessageTone, nextReportId = '') {
    setMessage(text);
    setMessageTone(tone);
    setReportId(nextReportId);
  }

  async function prepare(mode: 'automatic' | 'manual' = 'automatic') {
    if (mode === 'manual') setOpeningTyped(true);
    else setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/academic-spine/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          class_id: classId,
          course_id: courseId,
          calculation_mode: mode,
          expected_updated_at: selectedReport?.updated_at ?? null,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (['STALE_REPORT_DRAFT', 'REPORT_VERSION_REQUIRED'].includes(body.code)) await load();
        throw new Error(body.error || (mode === 'manual' ? 'Could not open for typed scores.' : 'Could not fill from class work.'));
      }
      const text = body.data.message || (mode === 'manual'
        ? 'Opened in Write. Auto-fill will not change these scores.'
        : 'Draft filled from class work. Review, then Publish.');
      const tone: MessageTone = mode === 'manual'
        ? 'neutral'
        : text.toLowerCase().includes('no class evidence')
          ? 'warning'
          : 'success';
      setFeedback(text, tone, body.data.report_id);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (mode === 'manual' ? 'Could not open for typed scores.' : 'Could not fill from class work.'));
    } finally {
      setSaving(false);
      setOpeningTyped(false);
    }
  }

  async function recalculate(id: string) {
    setRecalcId(id);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/academic-spine/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'recalculate',
          report_id: id,
          expected_updated_at: data.reports.find((report) => report.id === id)?.updated_at ?? null,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (['STALE_REPORT_DRAFT', 'REPORT_VERSION_REQUIRED'].includes(body.code)) await load();
        throw new Error(body.error || 'Could not refresh from class work.');
      }
      const text = body.data.message || autoFillResultMessage(body.data.calculation);
      setFeedback(
        text,
        text.toLowerCase().includes('no class evidence') ? 'warning' : 'success',
        id,
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not refresh from class work.');
    } finally {
      setRecalcId(null);
    }
  }

  async function fillClass() {
    if (!readyToFill || bulkTargets.length === 0) return;
    setBulkRunning(true);
    setError('');
    setMessage('');
    setBulkProgress({ done: 0, total: bulkTargets.length, filled: 0, empty: 0, skipped: 0 });
    let filled = 0;
    let empty = 0;
    let skipped = 0;
    let firstSkippedReason = '';
    try {
      for (let index = 0; index < bulkTargets.length; index += 1) {
        const student = bulkTargets[index];
        const existing = sessionScopedReports.find((report) =>
          report.student_id === student.id && report.course_id === courseId,
        );
        const response = await fetch('/api/academic-spine/results', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_id: student.id,
            class_id: classId,
            course_id: courseId,
            calculation_mode: 'automatic',
            expected_updated_at: existing?.updated_at ?? null,
          }),
        });
        const body = await response.json();
        if (!response.ok) {
          skipped += 1;
          if (!firstSkippedReason) firstSkippedReason = body.error || 'This learner could not be filled.';
        } else {
          const text = body.data.message || autoFillResultMessage(body.data.calculation);
          if (text.toLowerCase().includes('no class evidence')) empty += 1;
          else filled += 1;
        }
        setBulkProgress({ done: index + 1, total: bulkTargets.length, filled, empty, skipped });
      }
      setFeedback(
        `Class batch complete: ${filled} filled from evidence, ${empty} with no evidence yet${skipped ? `, ${skipped} skipped. First issue: ${firstSkippedReason}` : ''}.`,
        empty > 0 && filled === 0 ? 'warning' : 'success',
        '',
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bulk auto-fill failed.');
    } finally {
      setBulkRunning(false);
    }
  }

  const primaryBlocked = selectedReport?.calculation_mode === 'manual' || selectedReport?.is_published;
  const primaryLabel = selectedReport?.is_published
    ? 'Published — open Publish'
    : selectedReport?.calculation_mode === 'manual'
      ? 'Already typed — use Write'
      : selectedReport?.calculation_mode === 'automatic'
        ? (saving ? 'Refreshing…' : 'Refresh from class work')
        : (saving ? 'Working…' : 'Fill from class work');

  return (
    <div className={`mx-auto max-w-7xl space-y-4 p-4 sm:p-6 lg:p-8 ${MOBILE_PAGE_BOTTOM}`}>
      <div className="space-y-2">
        <h1 className="text-2xl font-black tracking-tight">Auto-fill</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Pull scores from class work for this term. Auto-fill never overwrites typed or published reports.
        </p>
      </div>

      <LearnerReportFlowStrip
        current="prepare"
        classId={classId}
        studentId={studentId}
        courseId={courseId}
        reportId={reportId || selectedReport?.id}
        from="prepare"
      />

      <AutoFillFlowGuide />

      {compulsorySchoolPapers ? (
        <div className="rounded-2xl border border-violet-500/25 bg-violet-500/10 px-4 py-3 text-sm text-muted-foreground">
          <strong className="text-foreground">Compulsory school pathway:</strong> Auto-fill may prepare classwork evidence, but First Test, Second Test and Examination remain the official papers. Open the draft in Write to review those marks before Publish &amp; Share.
        </div>
      ) : activeClass ? (
        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-muted-foreground">
          <strong className="text-foreground">Rillcod pathway:</strong> Auto-fill uses the class evidence already recorded in Rillcod. Review the unified draft in Write before publishing.
        </div>
      ) : null}

      {classId || selectedReport ? (
        <ReportSessionContextBanner
          context="autofill"
          workingSession={autoFillWorkingSession}
          classSession={classSession}
          reportSession={sessionFromReport(selectedReport)}
        />
      ) : null}

      {classId ? (
        <p className="text-xs text-muted-foreground">
          <Link href={buildClassTeachingHref({ classId, courseId })} className="font-bold text-primary hover:underline">
            Open class teaching
          </Link>
          {' '}to record assignments, CBT, and attendance before auto-fill.
        </p>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      ) : null}

      {message ? (
        <div className={`flex flex-col gap-3 rounded-2xl border p-4 text-sm sm:flex-row sm:items-center sm:justify-between ${
          messageTone === 'warning'
            ? 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100'
            : messageTone === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
              : 'border-border bg-muted/30 text-foreground'
        }`}>
          <span>{message}</span>
          {reportId ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href={learnerReportHref('write', { reportId, studentId, classId, courseId, from: 'prepare' })}
                className="rounded-xl bg-primary px-4 py-2 text-center text-xs font-bold text-primary-foreground"
              >
                Review in Write
              </Link>
              <Link
                href={learnerReportHref('publish', { reportId, studentId, classId, courseId })}
                className="rounded-xl border border-border px-4 py-2 text-center text-xs font-bold"
              >
                Publish
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      {bulkRunning ? (
        <div className="rounded-2xl border border-sky-500/25 bg-sky-500/5 p-4">
          <p className="text-sm font-bold text-sky-900 dark:text-sky-100">
            Filling class… {bulkProgress.done}/{bulkProgress.total}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-sky-500/15">
            <div
              className="h-full bg-sky-500 transition-all"
              style={{ width: `${bulkProgress.total ? (bulkProgress.done / bulkProgress.total) * 100 : 0}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {bulkProgress.filled} with evidence · {bulkProgress.empty} no evidence · {bulkProgress.skipped} skipped
          </p>
        </div>
      ) : null}

      <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-black">Choose class & learner</h2>
            <p className="mt-1 text-sm text-muted-foreground">Auto-fill uses the class programme, reporting period, and teaching plan.</p>
          </div>
          {classId && courseId ? (
            <AutoFillClassSummary students={students} reports={data.reports} courseId={courseId} />
          ) : null}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <label className="text-sm font-bold">
            Class
            <select
              value={classId}
              onChange={(event) => {
                setClassId(event.target.value);
                setStudentId('');
                setCourseId('');
              }}
              className="mt-2 w-full rounded-xl border border-border bg-background p-3 font-normal"
            >
              <option value="">Choose class</option>
              {data.classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatClassRowOptionLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold">
            Learner
            <select
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-background p-3 font-normal"
            >
              <option value="">Choose learner</option>
              {students.map((item) => (
                <option key={item.id} value={item.id}>{item.full_name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold">
            Course
            <select
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
              className="mt-2 w-full rounded-xl border border-border bg-background p-3 font-normal"
            >
              <option value="">Choose course</option>
              {courseOptions.map((item) => (
                <option key={item.id} value={item.course_id}>
                  {item.courses?.title || 'Course'}
                  {item.curriculum_release_id ? '' : ' (needs teaching plan)'}
                </option>
              ))}
            </select>
          </label>
        </div>

        {activeClass ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {enrollmentLabel[activeClass.academic_offerings?.enrollment_type || ''] || 'Programme'}
            {' · '}
            {activeClass.academic_offering_periods?.label || 'Current period'}
          </p>
        ) : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <AutoFillReadinessPanel items={readiness} />
          <AutoFillLearnerContext report={selectedReport} classId={classId} courseId={courseId} />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (selectedReport?.calculation_mode === 'automatic' && !selectedReport.is_published && selectedReport.id) {
                void recalculate(selectedReport.id);
                return;
              }
              void prepare('automatic');
            }}
            disabled={saving || openingTyped || bulkRunning || !readyToFill || primaryBlocked}
            className="min-h-11 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground disabled:opacity-50"
            title={primaryBlocked ? 'Typed and published reports must be opened in Write or Publish' : undefined}
          >
            {primaryLabel}
          </button>
          <button
            type="button"
            onClick={() => void prepare('manual')}
            disabled={saving || openingTyped || bulkRunning || !readyToFill}
            className="min-h-11 rounded-xl border border-border bg-background px-6 py-3 font-bold disabled:opacity-50"
          >
            {openingTyped ? 'Opening…' : 'Open for typed scores'}
          </button>
          <button
            type="button"
            onClick={() => void fillClass()}
            disabled={saving || openingTyped || bulkRunning || !readyToFill || bulkTargets.length === 0}
            className="min-h-11 rounded-xl border border-sky-500/40 bg-sky-500/10 px-6 py-3 font-bold text-sky-900 dark:text-sky-100 disabled:opacity-50"
            title={bulkTargets.length === 0 ? 'Every learner is typed, published, or already has a draft' : undefined}
          >
            {bulkRunning ? 'Filling class…' : `Fill class (${bulkTargets.length})`}
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-black">Class reports</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Refresh only works on unpublished Auto-fill drafts. Typed scores stay protected.
            </p>
          </div>
          <input
            aria-label="Search learners or courses"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search learner or course"
            className="min-h-11 w-full rounded-xl border border-border bg-background px-4 py-2 text-sm lg:max-w-xs"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Result list filters">
          {(
            [
              ['all', `All (${counts.all})`],
              ['automatic', `Auto-fill (${counts.automatic})`],
              ['manual', `Typed (${counts.manual})`],
              ['no_evidence', `No evidence (${counts.no_evidence})`],
              ['draft', `Draft (${counts.draft})`],
              ['published', `Published (${counts.published})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={listFilter === key}
              onClick={() => setListFilter(key)}
              className={`rounded-xl px-3 py-2 text-xs font-black ${
                listFilter === key ? 'bg-primary text-primary-foreground' : 'border border-border bg-background'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {visibleReports.slice(0, listLimit).map((report) => {
            const score = formatReportScoreDisplay(report);
            return (
              <article
                key={report.id}
                className="flex flex-col gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-black text-foreground">
                    {report.student_name} · {report.course_name}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {report.report_term} {report.report_period}
                  </p>
                  <div className="mt-2">
                    <ResultStatusBadges report={report} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <div className="text-right">
                    <span className="text-xl font-black tabular-nums text-foreground">{score.value}</span>
                    {score.hint ? (
                      <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">{score.hint}</p>
                    ) : report.overall_grade ? (
                      <p className="text-xs font-bold text-muted-foreground">{report.overall_grade}</p>
                    ) : null}
                  </div>
                  <Link
                    href={learnerReportHref('write', {
                      reportId: report.id,
                      studentId: report.student_id,
                      classId: report.class_id || classId,
                      courseId: report.course_id,
                      term: report.report_term,
                      period: report.report_period,
                      from: 'prepare',
                    })}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
                  >
                    {report.calculation_mode === 'manual' ? 'Edit scores' : 'Review'}
                  </Link>
                  {report.calculation_mode === 'automatic' && !report.is_published ? (
                    <button
                      type="button"
                      disabled={recalcId === report.id || bulkRunning}
                      onClick={() => void recalculate(report.id)}
                      className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm font-bold text-sky-800 dark:text-sky-200 disabled:opacity-50"
                    >
                      {recalcId === report.id ? 'Refreshing…' : 'Refresh'}
                    </button>
                  ) : null}
                  <Link
                    href={learnerReportHref('publish', {
                      reportId: report.id,
                      studentId: report.student_id,
                      classId: report.class_id || classId,
                      courseId: report.course_id,
                      term: report.report_term,
                      period: report.report_period,
                    })}
                    className="rounded-xl border border-border px-4 py-2 text-sm font-bold"
                  >
                    Publish
                  </Link>
                </div>
              </article>
            );
          })}
          {visibleReports.length > listLimit && (
            <div className="rounded-2xl border border-border bg-muted/40 p-4 text-center">
              <p className="text-xs font-bold text-muted-foreground">
                Showing {listLimit} of {visibleReports.length} results in this filter.
              </p>
              <button
                type="button"
                onClick={() => setListLimit((current) => current + 60)}
                className="mt-2 min-h-11 rounded-xl border border-border bg-background px-4 py-2 text-sm font-black text-foreground hover:border-primary/40"
              >
                Show 60 more
              </button>
            </div>
          )}
          {visibleReports.length === 0 ? (
            <p className="rounded-2xl bg-muted p-5 text-sm text-muted-foreground">
              Nothing matches this filter. Fill from class work above, or type scores in Write.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
