'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ResultStatusBadges } from '@/components/reports/ResultStatusBadges';

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
  const [data, setData] = useState<Data>({ classes: [], students: [], plans: [], reports: [] });
  const [classId, setClassId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [mode, setMode] = useState<'automatic' | 'manual'>('manual');
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reportId, setReportId] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/academic-spine/results', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) return setError(body.error || 'Unable to open results.');
    setData(body.data);
    setError('');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeClass = data.classes.find((item) => item.id === classId);
  const students = useMemo(() => data.students.filter((item) => item.class_id === classId), [data.students, classId]);
  const plans = useMemo(() => data.plans.filter((item) => item.class_id === classId), [data.plans, classId]);

  const visibleReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.reports.filter((report) => {
      if (classId && report.class_id && report.class_id !== classId) return false;
      if (listFilter === 'manual' && report.calculation_mode !== 'manual') return false;
      if (listFilter === 'automatic' && report.calculation_mode !== 'automatic') return false;
      if (listFilter === 'draft' && report.is_published) return false;
      if (listFilter === 'published' && !report.is_published) return false;
      if (!q) return true;
      return `${report.student_name} ${report.course_name} ${report.report_term} ${report.report_period}`
        .toLowerCase()
        .includes(q);
    });
  }, [data.reports, classId, listFilter, search]);

  const counts = useMemo(() => {
    const scoped = classId
      ? data.reports.filter((r) => !r.class_id || r.class_id === classId)
      : data.reports;
    return {
      all: scoped.length,
      manual: scoped.filter((r) => r.calculation_mode === 'manual').length,
      automatic: scoped.filter((r) => r.calculation_mode === 'automatic').length,
      draft: scoped.filter((r) => !r.is_published).length,
      published: scoped.filter((r) => r.is_published).length,
    };
  }, [data.reports, classId]);

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
          ? (body.data.message || 'Manual result is ready for entry. Existing marks will not be overwritten.')
          : 'The result was calculated from recorded evidence and checked.',
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Result could not be prepared.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <section className="rounded-3xl border border-border bg-card p-6 sm:p-8">
        <Link href="/dashboard/academic" className="text-sm font-bold text-primary">
          Back to Academic Office
        </Link>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground">Results workspace</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          One place for learner progress reports. Prepare a row here, enter marks in Report Builder,
          then publish and share from Records. Manual marks stay protected — automation never overwrites them.
        </p>
        <ol className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            { step: '1', title: 'Prepare', detail: 'Create or open the report for a learner and course.' },
            { step: '2', title: 'Enter / edit', detail: 'Report Builder — your solid grading desk.' },
            { step: '3', title: 'Publish & share', detail: 'Records desk for print, email and parent view.' },
          ].map((item) => (
            <li key={item.step} className="rounded-2xl border border-border bg-muted/30 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Step {item.step}</p>
              <p className="mt-1 font-black text-foreground">{item.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/dashboard/reports/builder"
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-bold"
          >
            Open Report Builder
          </Link>
          <Link
            href="/dashboard/results"
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-bold"
          >
            Publish & share (Records)
          </Link>
        </div>
      </section>

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
              Edit in Report Builder
            </Link>
          ) : null}
        </div>
      ) : null}

      <section className="rounded-3xl border border-border bg-card p-6">
        <h2 className="text-xl font-black">1. Prepare a learner result</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Creates or opens the same <code className="text-xs">student_progress_reports</code> row used by Report Builder.
          Choosing manual never overwrites an existing protected manual result.
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
          <label className="text-sm font-bold">
            How marks are entered
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as 'automatic' | 'manual')}
              className="mt-2 w-full rounded-xl border border-border bg-background p-3 font-normal"
            >
              <option value="manual">Manual entry (protected)</option>
              <option value="automatic">Automatic from evidence</option>
            </select>
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
            <h2 className="text-xl font-black">2. Same reports — one list</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              These are the progress reports you enter in Report Builder. Not a second gradebook.
            </p>
          </div>
          <input
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
          {visibleReports.slice(0, 60).map((report) => (
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
                  Edit in Builder
                </Link>
                <Link
                  href={`/dashboard/results?student=${encodeURIComponent(report.student_id || '')}`}
                  className="rounded-xl border border-border px-4 py-2 text-sm font-bold"
                >
                  Publish & share
                </Link>
              </div>
            </article>
          ))}
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
