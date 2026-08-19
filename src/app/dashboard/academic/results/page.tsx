'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ResultStatusBadges } from '@/components/reports/ResultStatusBadges';
import { LearnerReportFlowStrip, learnerReportHref } from '@/components/reports/LearnerReportFlowStrip';
import { buildClassTeachingHref } from '@/lib/curriculum/href';
import { MOBILE_PAGE_BOTTOM } from '@/components/mobile/mobile-styles';

type Klass = {
  id: string;
  name: string;
  academic_offerings?: { title: string; enrollment_type: string; academic_model: string } | null;
  academic_offering_periods?: { label: string } | null;
};
type Student = { id: string; full_name: string; class_id: string; enrollment_type: string };
type Plan = { id: string; class_id: string; course_id: string; curriculum_release_id: string | null; courses?: { title: string } | null };
type Report = {
  id: string;
  student_id?: string;
  class_id?: string;
  course_id?: string;
  student_name: string;
  course_name: string;
  report_term: string;
  report_period: string;
  overall_score: number | null;
  overall_grade: string | null;
  calculation_mode: string;
  academic_qa_status: string;
  is_published: boolean;
  updated_at?: string;
};
type Data = { classes: Klass[]; students: Student[]; plans: Plan[]; reports: Report[] };

const enrollmentLabel: Record<string, string> = {
  school: 'Regular School',
  online: 'Virtual School',
  special: 'Special Programme',
  in_person: 'Special Programme (in person)',
};

type ListFilter = 'all' | 'manual' | 'automatic' | 'draft' | 'published';

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

  const [data, setData] = useState<Data>({ classes: [], students: [], plans: [], reports: [] });
  const [classId, setClassId] = useState(linkedClassId);
  const [studentId, setStudentId] = useState(linkedStudentId);
  const [courseId, setCourseId] = useState(linkedCourseId);
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [recalcId, setRecalcId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reportId, setReportId] = useState('');
  // The list was hard-capped at 60 with nothing on screen to say so, so a school
  // past that number simply could not see its remaining results.
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

  useEffect(() => {
    if (linkedClassId) setClassId(linkedClassId);
  }, [linkedClassId]);

  useEffect(() => {
    if (linkedCourseId) setCourseId(linkedCourseId);
  }, [linkedCourseId]);

  useEffect(() => {
    if (linkedStudentId) setStudentId(linkedStudentId);
  }, [linkedStudentId]);

  const activeClass = data.classes.find((item) => item.id === classId);
  const students = useMemo(() => data.students.filter((item) => item.class_id === classId), [data.students, classId]);
  const plans = useMemo(() => data.plans.filter((item) => item.class_id === classId), [data.plans, classId]);
  const courseOptions = useMemo(
    () => [...new Map(plans.map((plan) => [plan.course_id, plan])).values()],
    [plans],
  );

  useEffect(() => {
    if (!classId) return;
    setCourseId((current) => {
      if (current && courseOptions.some((plan) => plan.course_id === current)) return current;
      return courseOptions.length === 1 ? courseOptions[0].course_id : '';
    });
  }, [classId, courseOptions]);

  useEffect(() => {
    if (!classId || students.length === 0) return;
    setStudentId((current) => {
      if (current && students.some((student) => student.id === current)) return current;
      const learnerWithoutResult = courseId
        ? students.find((student) => !data.reports.some((report) =>
            report.student_id === student.id && report.course_id === courseId,
          ))
        : null;
      return learnerWithoutResult?.id ?? students[0].id;
    });
  }, [classId, courseId, courseOptions, data.reports, students]);

  const classStudentIds = useMemo(
    () => new Set(students.map((s) => s.id)),
    [students],
  );

  const visibleReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.reports.filter((report) => {
      if (classId) {
        const inSelectedClass =
          report.class_id === classId ||
          (!!report.student_id && classStudentIds.has(report.student_id));
        if (!inSelectedClass) return false;
      }
      if (listFilter === 'manual' && report.calculation_mode !== 'manual') return false;
      if (listFilter === 'automatic' && report.calculation_mode !== 'automatic') return false;
      if (listFilter === 'draft' && report.is_published) return false;
      if (listFilter === 'published' && !report.is_published) return false;
      if (!q) return true;
      return `${report.student_name} ${report.course_name} ${report.report_term} ${report.report_period}`
        .toLowerCase()
        .includes(q);
    });
  }, [data.reports, classId, classStudentIds, listFilter, search]);

  const counts = useMemo(() => {
    const scoped = classId
      ? data.reports.filter(
          (r) =>
            r.class_id === classId ||
            (!!r.student_id && classStudentIds.has(r.student_id)),
        )
      : data.reports;
    return {
      all: scoped.length,
      manual: scoped.filter((r) => r.calculation_mode === 'manual').length,
      automatic: scoped.filter((r) => r.calculation_mode === 'automatic').length,
      draft: scoped.filter((r) => !r.is_published).length,
      published: scoped.filter((r) => r.is_published).length,
    };
  }, [data.reports, classId, classStudentIds]);

  async function prepare() {
    setSaving(true);
    setError('');
    setMessage('');
    setReportId('');
    try {
      const response = await fetch('/api/academic-spine/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          class_id: classId,
          course_id: courseId,
          calculation_mode: 'automatic',
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not fill from class work.');
      setReportId(body.data.report_id);
      setMessage(
        body.data.message || 'Draft filled from class work. Review, then Publish.',
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not fill from class work.');
    } finally {
      setSaving(false);
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
        body: JSON.stringify({ action: 'recalculate', report_id: id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not refresh from class work.');
      setMessage('Scores refreshed from the latest class work.');
      setReportId(id);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not refresh from class work.');
    } finally {
      setRecalcId(null);
    }
  }

  return (
    <div className={`mx-auto max-w-7xl space-y-4 p-4 sm:p-6 lg:p-8 ${MOBILE_PAGE_BOTTOM}`}>
      <LearnerReportFlowStrip
        current="prepare"
        classId={classId}
        studentId={studentId}
        courseId={courseId}
      />
      {classId ? (
        <p className="text-xs text-muted-foreground">
          <Link href={buildClassTeachingHref({ classId, courseId })} className="font-bold text-primary hover:underline">
            Class teaching
          </Link>
        </p>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      ) : null}
      {message ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-200 sm:flex-row sm:items-center sm:justify-between">
          <span>{message}</span>
          {reportId ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href={learnerReportHref('write', {
                  reportId,
                  studentId,
                  classId,
                  courseId,
                  from: 'prepare',
                })}
                className="rounded-xl bg-emerald-700 px-4 py-2 text-center font-bold text-white"
              >
                Review scores
              </Link>
              <Link
                href={learnerReportHref('publish', { studentId, classId, courseId })}
                className="rounded-xl border border-emerald-700/30 px-4 py-2 text-center font-bold"
              >
                Publish
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-lg font-black">Choose a learner</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
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
                <option key={item.id} value={item.id}>{item.name}</option>
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
        <details className="mt-3 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-bold">If this is blocked</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-muted-foreground">
            <li>Class needs a programme and reporting period</li>
            <li>Learner placement must match that class</li>
            <li>Course needs a teaching plan</li>
            <li>There should be some class work to score from</li>
          </ul>
        </details>
        <button
          type="button"
          onClick={() => void prepare()}
          disabled={saving || !classId || !studentId || !courseId}
          className="mt-5 min-h-11 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground disabled:opacity-50"
        >
          {saving ? 'Working…' : 'Fill scores'}
        </button>
      </section>

      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-black">These reports</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Refresh only works on unpublished Auto-fill drafts.
            </p>
          </div>
          <input aria-label="Search learners or courses"
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
              ['manual', `Typed (${counts.manual})`],
              ['automatic', `Auto-fill (${counts.automatic})`],
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
          {visibleReports.slice(0, listLimit).map((report) => (
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
                <span className="text-xl font-black">
                  {report.overall_score ?? '—'}
                  {report.overall_score == null ? '' : '%'}
                  {report.overall_grade ? (
                    <span className="ml-2 text-sm font-bold text-muted-foreground">{report.overall_grade}</span>
                  ) : null}
                </span>
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
                    disabled={recalcId === report.id}
                    onClick={() => void recalculate(report.id)}
                    className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm font-bold text-sky-800 dark:text-sky-200 disabled:opacity-50"
                  >
                    {recalcId === report.id ? 'Refreshing…' : 'Refresh'}
                  </button>
                ) : null}
                <Link
                  href={learnerReportHref('publish', {
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
          ))}
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
