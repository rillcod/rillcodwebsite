'use client';

import Link from 'next/link';
import { automaticResultHasNoEvidence, reportHasDisplayableScores } from '@/lib/reports/score';
import { ResultStatusBadges } from '@/components/reports/ResultStatusBadges';
import { learnerReportHref } from '@/components/reports/LearnerReportFlowStrip';

export type AutoFillReport = {
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
  calculation_snapshot?: unknown;
  engagement_metrics?: unknown;
};

export function formatReportScoreDisplay(report: AutoFillReport): { value: string; hint?: string } {
  if (!reportHasDisplayableScores(report)) {
    return { value: '—', hint: 'No class evidence yet' };
  }
  if (report.overall_score == null) return { value: '—' };
  return {
    value: `${report.overall_score}%`,
    hint: report.overall_grade || undefined,
  };
}

type ReadinessItem = {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
};

export function buildAutoFillReadiness(input: {
  classId: string;
  studentId: string;
  courseId: string;
  activeClass?: {
    academic_offering_id?: string | null;
    offering_period_id?: string | null;
    academic_offerings?: { title: string } | null;
    academic_offering_periods?: { label: string } | null;
  } | null;
  selectedStudent?: { full_name: string; class_id: string } | null;
  selectedPlan?: { curriculum_release_id: string | null; courses?: { title: string } | null } | null;
}): ReadinessItem[] {
  const { classId, studentId, courseId, activeClass, selectedStudent, selectedPlan } = input;
  return [
    {
      key: 'class',
      label: 'Class & programme',
      ok: Boolean(classId && activeClass?.academic_offerings),
      detail: activeClass?.academic_offerings?.title || 'Pick a class with a programme',
    },
    {
      key: 'period',
      label: 'Reporting period',
      ok: Boolean(activeClass?.academic_offering_periods?.label),
      detail: activeClass?.academic_offering_periods?.label || 'Set the class reporting period',
    },
    {
      key: 'learner',
      label: 'Learner placement',
      ok: Boolean(studentId && selectedStudent && selectedStudent.class_id === classId),
      detail: selectedStudent?.full_name || 'Choose a learner in this class',
    },
    {
      key: 'course',
      label: 'Teaching plan',
      ok: Boolean(courseId && selectedPlan?.curriculum_release_id),
      detail: selectedPlan?.courses?.title
        ? selectedPlan.curriculum_release_id
          ? selectedPlan.courses.title
          : `${selectedPlan.courses.title} — needs a teaching plan`
        : 'Choose the course being taught',
    },
  ];
}

export function AutoFillReadinessPanel({ items }: { items: ReadinessItem[] }) {
  const ready = items.every((item) => item.ok);
  return (
    <div className={`rounded-2xl border p-4 ${ready ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-border bg-muted/20'}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Ready to auto-fill</p>
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${ready ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-800 dark:text-amber-200'}`}>
          {ready ? 'Ready' : `${items.filter((i) => i.ok).length}/${items.length}`}
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-2 text-sm">
            <span className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-black ${item.ok ? 'bg-emerald-500 text-white' : 'border border-border bg-background text-muted-foreground'}`}>
              {item.ok ? '✓' : '·'}
            </span>
            <span className="min-w-0">
              <span className="font-bold text-foreground">{item.label}</span>
              <span className="block text-xs text-muted-foreground">{item.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AutoFillLearnerContext({
  report,
  classId,
  courseId,
}: {
  report: AutoFillReport | null;
  classId: string;
  courseId: string;
}) {
  if (!report) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/10 p-4">
        <p className="text-sm font-bold text-foreground">No report yet for this learner + course</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Auto-fill creates a draft from CBT, assignments, and attendance. Use Write only if you want to type scores yourself.
        </p>
      </div>
    );
  }

  const noEvidence = automaticResultHasNoEvidence(report);
  const score = formatReportScoreDisplay(report);

  return (
    <div className={`rounded-2xl border p-4 ${noEvidence ? 'border-amber-500/25 bg-amber-500/5' : 'border-border bg-muted/10'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-foreground">Existing report</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {report.report_term} {report.report_period}
          </p>
        </div>
        <ResultStatusBadges report={report} />
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Overall</p>
          <p className="text-2xl font-black tabular-nums text-foreground">{score.value}</p>
          {score.hint ? <p className="text-xs font-semibold text-muted-foreground">{score.hint}</p> : null}
        </div>
        {noEvidence ? (
          <p className="max-w-sm text-xs leading-5 text-amber-900 dark:text-amber-100">
            Auto-fill ran but found no class work for this term. Record evidence first, refresh the draft, or type scores in Write.
          </p>
        ) : report.calculation_mode === 'manual' ? (
          <p className="max-w-sm text-xs leading-5 text-emerald-800 dark:text-emerald-200">
            Scores were typed. Auto-fill will not overwrite them — continue in Write.
          </p>
        ) : report.is_published ? (
          <p className="max-w-sm text-xs leading-5 text-muted-foreground">
            This report is published. Open Publish to view or unpublish before refreshing scores.
          </p>
        ) : (
          <p className="max-w-sm text-xs leading-5 text-sky-900 dark:text-sky-100">
            Draft filled from class evidence. Review in Write, then Publish when ready.
          </p>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={learnerReportHref('write', {
            reportId: report.id,
            studentId: report.student_id,
            classId: report.class_id || classId,
            courseId: report.course_id || courseId,
            term: report.report_term,
            period: report.report_period,
            from: 'prepare',
          })}
          className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
        >
          {report.calculation_mode === 'manual' ? 'Edit in Write' : 'Review in Write'}
        </Link>
        <Link
          href={learnerReportHref('publish', {
            reportId: report.id,
            studentId: report.student_id,
            classId: report.class_id || classId,
            courseId: report.course_id || courseId,
            term: report.report_term,
            period: report.report_period,
          })}
          className="rounded-xl border border-border px-3 py-2 text-xs font-bold"
        >
          Open Publish
        </Link>
      </div>
    </div>
  );
}

export function AutoFillClassSummary({
  students,
  reports,
  courseId,
}: {
  students: Array<{ id: string; full_name: string }>;
  reports: AutoFillReport[];
  courseId: string;
}) {
  if (!courseId || students.length === 0) return null;

  const scoped = reports.filter((r) => r.course_id === courseId && students.some((s) => s.id === r.student_id));
  const typed = scoped.filter((r) => r.calculation_mode === 'manual').length;
  const autoDraft = scoped.filter((r) => r.calculation_mode === 'automatic' && !r.is_published).length;
  const published = scoped.filter((r) => r.is_published).length;
  const withScores = scoped.filter((r) => reportHasDisplayableScores(r)).length;
  const noEvidence = scoped.filter((r) => automaticResultHasNoEvidence(r)).length;
  const uncovered = students.length - scoped.length;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {[
        { label: 'Learners', value: students.length },
        { label: 'With report', value: scoped.length },
        { label: 'Auto-fill draft', value: autoDraft },
        { label: 'Typed', value: typed },
        { label: 'Published', value: published },
        { label: 'No evidence', value: noEvidence + uncovered, warn: noEvidence + uncovered > 0 },
      ].map((item) => (
        <div key={item.label} className={`rounded-xl border px-3 py-2 ${item.warn ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-background'}`}>
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{item.label}</p>
          <p className="mt-0.5 text-xl font-black tabular-nums text-foreground">{item.value}</p>
          {item.label === 'With report' && withScores > 0 ? (
            <p className="text-[10px] text-muted-foreground">{withScores} with scores</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function AutoFillFlowGuide() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {[
        {
          title: 'Auto-fill',
          tone: 'border-sky-500/25 bg-sky-500/5',
          body: 'Pulls scores from CBT, assignments, and attendance for this term. Best when class work is already recorded.',
        },
        {
          title: 'Write',
          tone: 'border-emerald-500/25 bg-emerald-500/5',
          body: 'Type or adjust scores manually. Once typed, Auto-fill will not overwrite them.',
        },
        {
          title: 'Publish',
          tone: 'border-primary/25 bg-primary/5',
          body: 'Preview the report card, then publish for parents and learners.',
        },
      ].map((step) => (
        <div key={step.title} className={`rounded-2xl border p-4 ${step.tone}`}>
          <p className="text-xs font-black uppercase tracking-wider text-foreground">{step.title}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{step.body}</p>
        </div>
      ))}
    </div>
  );
}
