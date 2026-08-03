'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChartBarIcon } from '@/lib/icons';
import { ResultStatusBadges } from '@/components/reports/ResultStatusBadges';
import { buildClassTeachingHref } from '@/lib/curriculum/href';
import MobilePageHero from '@/components/mobile/MobilePageHero';
import { MOBILE_PAGE_BOTTOM, MOBILE_TOUCH_BTN } from '@/components/mobile/mobile-styles';

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

  const [data, setData] = useState<Data>({ classes: [], students: [], plans: [], reports: [] });
  const [classId, setClassId] = useState(linkedClassId);
  const [studentId, setStudentId] = useState('');
  const [courseId, setCourseId] = useState(linkedCourseId);
  const [mode, setMode] = useState<'automatic' | 'manual'>('automatic');
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
    const response = await fetch('/api/academic-spine/results', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) return setError(body.error || 'Unable to open results.');
    setData(body.data);
    setError('');
    if (linkedClassId) setClassId((current) => current || linkedClassId);
    if (linkedCourseId) setCourseId((current) => current || linkedCourseId);
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

  const activeClass = data.classes.find((item) => item.id === classId);
  const students = useMemo(() => data.students.filter((item) => item.class_id === classId), [data.students, classId]);
  const plans = useMemo(() => data.plans.filter((item) => item.class_id === classId), [data.plans, classId]);

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
          calculation_mode: mode,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Result could not be prepared.');
      setReportId(body.data.report_id);
      setMessage(
        mode === 'manual'
          ? (body.data.message || 'Protected manual result ready — open Report Builder to enter marks.')
          : 'Automatic draft calculated from evidence. Review if needed, then publish from Publish & Share.',
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Result could not be prepared.');
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
      if (!response.ok) throw new Error(body.error || 'Could not recalculate from evidence.');
      setMessage('Automatic result recalculated from the latest evidence.');
      setReportId(id);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not recalculate from evidence.');
    } finally {
      setRecalcId(null);
    }
  }

  return (
    <div className={`mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8 ${MOBILE_PAGE_BOTTOM}`}>
      <MobilePageHero
        badge="Academic Office · Results"
        title="Results workspace"
        description="Prepare learner results from evidence or open protected manual entry in Report Builder."
        icon={ChartBarIcon}
        stats={[
          { label: 'Classes', value: data.classes.length },
          {
            label: 'Prepared results',
            value: data.reports.length,
            tone: 'primary',
          },
          {
            label: 'Published',
            value: data.reports.filter((r) => r.is_published).length,
            tone: 'emerald',
          },
        ]}
        actions={
          <>
            <Link href="/dashboard/academic" className={`${MOBILE_TOUCH_BTN} border border-border bg-background text-foreground`}>
              Academic Office
            </Link>
            {classId ? (
              <Link
                href={buildClassTeachingHref({ classId, courseId })}
                className={`${MOBILE_TOUCH_BTN} border border-border bg-background text-muted-foreground hover:text-foreground`}
              >
                Class teaching
              </Link>
            ) : null}
            <Link href="/dashboard/reports/builder" className={`${MOBILE_TOUCH_BTN} bg-primary text-primary-foreground`}>
              Report Builder
            </Link>
          </>
        }
      >
        <ol className="mt-4 grid gap-2 sm:grid-cols-3">
          {[
            { step: '1', title: 'Prepare (here)', detail: 'Auto from evidence or manual shell.' },
            { step: '2', title: 'Report Builder', detail: 'Enter scores and narrative.' },
            { step: '3', title: 'Publish & share', detail: 'Release to families.' },
          ].map((item) => (
            <li key={item.step} className="rounded-xl border border-border/80 bg-background/60 px-3 py-2.5">
              <p className="text-[9px] font-black uppercase tracking-widest text-primary">Step {item.step}</p>
              <p className="text-xs font-black text-foreground">{item.title}</p>
              <p className="text-[10px] text-muted-foreground">{item.detail}</p>
            </li>
          ))}
        </ol>
      </MobilePageHero>

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      ) : null}
      {message ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-200 sm:flex-row sm:items-center sm:justify-between">
          <span>{message}</span>
              {reportId ? (
            <Link
              href={`/dashboard/reports/builder?report=${reportId}`}
              className="rounded-xl bg-emerald-700 px-4 py-2 text-center font-bold text-white"
            >
              {mode === 'manual' ? 'Enter marks in Report Builder' : 'Review in Report Builder'}
            </Link>
          ) : null}
        </div>
      ) : null}

      <section className="rounded-3xl border border-border bg-card p-6">
        <h2 className="text-xl font-black">1. Prepare a learner result</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Default path is <strong className="text-foreground">automatic from evidence</strong>.
          Choose manual only when you will type scores in Report Builder. Manual never overwrites an existing protected manual result.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-bold">
            Class or cohort
            <select
              value={classId}
              onChange={(event) => {
                setClassId(event.target.value);
                setStudentId('');
                setCourseId('');
              }}
              className="mt-2 w-full rounded-xl border border-border bg-background p-3 font-normal"
            >
              <option value="">Choose class or cohort</option>
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
              <option value="">Choose planned course</option>
              {plans.map((item) => (
                <option key={item.id} value={item.course_id}>
                  {item.courses?.title || 'Course'}
                  {item.curriculum_release_id ? '' : ' (direction needed)'}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold md:col-span-2 xl:col-span-4">
            Prepare mode
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMode('automatic')}
                aria-pressed={mode === 'automatic'}
                className={`rounded-2xl border p-4 text-left transition-colors ${
                  mode === 'automatic'
                    ? 'border-sky-500/50 bg-sky-500/10 ring-2 ring-sky-500/30'
                    : 'border-border bg-background hover:bg-muted/40'
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-sky-700 dark:text-sky-300">Recommended here</p>
                <p className="mt-1 font-black text-foreground">Automatic from evidence</p>
                <p className="mt-1 text-xs font-normal text-muted-foreground leading-5">
                  Workspace builds a draft from assignments, CBT, practicals and attendance.
                  Needs pathway + teaching plan. Cannot replace a protected manual result.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setMode('manual')}
                aria-pressed={mode === 'manual'}
                className={`rounded-2xl border p-4 text-left transition-colors ${
                  mode === 'manual'
                    ? 'border-emerald-500/50 bg-emerald-500/10 ring-2 ring-emerald-500/30'
                    : 'border-border bg-background hover:bg-muted/40'
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Then open Builder</p>
                <p className="mt-1 font-black text-foreground">Manual entry (protected)</p>
                <p className="mt-1 text-xs font-normal text-muted-foreground leading-5">
                  Creates a protected shell, then you type scores in Report Builder. Automation cannot overwrite them.
                </p>
              </button>
            </div>
          </label>
        </div>
        {activeClass ? (
          <div className="mt-4 rounded-2xl bg-muted p-4 text-sm">
            <span className="font-black">
              {enrollmentLabel[activeClass.academic_offerings?.enrollment_type || ''] || 'Academic pathway'}
            </span>
            <span className="text-muted-foreground">
              {' '}· {activeClass.academic_offering_periods?.label || 'Learning period'} ·{' '}
              {mode === 'manual' ? 'entered marks stay protected' : 'weighted evidence will calculate the draft'}
            </span>
          </div>
        ) : null}
        {mode === 'automatic' ? (
          <div className="mt-4 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-sky-900 dark:text-sky-100">
            <p className="font-black">Before automatic works</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
              <li>Class has an academic pathway and reporting period set</li>
              <li>Learner enrollment matches that pathway</li>
              <li>Course has an official teaching plan / curriculum direction</li>
              <li>Some evidence exists (assignments, CBT, attendance, etc.)</li>
              <li>This learner+course+period is not already a protected manual result</li>
            </ul>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => void prepare()}
          disabled={saving || !classId || !studentId || !courseId}
          className="mt-5 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground disabled:opacity-50"
        >
          {saving
            ? 'Preparing result…'
            : mode === 'manual'
              ? 'Create / open protected manual result'
              : 'Calculate from evidence'}
        </button>
      </section>

      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-black">2. Prepared results</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Same progress reports as Report Builder and Publish &amp; Share — not a second gradebook.
              Use <strong className="text-foreground">Recalculate</strong> only on automatic rows.
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
              ['manual', `Manual (${counts.manual})`],
              ['automatic', `Automatic (${counts.automatic})`],
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
                  href={`/dashboard/reports/builder?report=${report.id}`}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
                >
                  {report.calculation_mode === 'manual' ? 'Enter in Builder' : 'Review in Builder'}
                </Link>
                {report.calculation_mode === 'automatic' ? (
                  <button
                    type="button"
                    disabled={recalcId === report.id}
                    onClick={() => void recalculate(report.id)}
                    className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm font-bold text-sky-800 dark:text-sky-200 disabled:opacity-50"
                  >
                    {recalcId === report.id ? 'Recalculating…' : 'Recalculate'}
                  </button>
                ) : null}
                <Link
                  href={`/dashboard/results?student=${encodeURIComponent(report.student_id || '')}`}
                  className="rounded-xl border border-border px-4 py-2 text-sm font-bold"
                >
                  Publish & share
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
              No results match this filter yet. Prepare a learner result above, or open Report Builder to enter marks.
            </p>
          ) : null}
        </div>
    </section>
    </div>
  );
}
