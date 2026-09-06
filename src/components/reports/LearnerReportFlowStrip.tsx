'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

export const LEARNER_REPORT_STEPS = [
  {
    key: 'write',
    href: '/dashboard/reports/builder',
    label: 'Write & edit',
    detail: 'Start or continue a report',
  },
  {
    key: 'prepare',
    href: '/dashboard/academic/results',
    label: 'Auto-fill scores',
    detail: 'Optional helper',
  },
  {
    key: 'publish',
    href: '/dashboard/results',
    label: 'Review & publish',
    detail: 'Check, release and share',
  },
] as const;

export type LearnerReportStep = (typeof LEARNER_REPORT_STEPS)[number]['key'];

export type LearnerReportContext = {
  studentId?: string | null;
  reportId?: string | null;
  classId?: string | null;
  courseId?: string | null;
  schoolId?: string | null;
  term?: string | null;
  period?: string | null;
  from?: 'results' | 'prepare' | string | null;
};

function stepFromPath(pathname: string): LearnerReportStep | null {
  if (pathname.startsWith('/dashboard/reports/builder')) return 'write';
  if (pathname.startsWith('/dashboard/academic/results')) return 'prepare';
  if (pathname === '/dashboard/results' || pathname.startsWith('/dashboard/results/')) return 'publish';
  return null;
}

function firstValue(search: URLSearchParams, ...keys: string[]) {
  for (const key of keys) {
    const value = search.get(key)?.trim();
    if (value) return value;
  }
  return '';
}

export function learnerReportHref(step: LearnerReportStep, context: LearnerReportContext = {}) {
  const params = new URLSearchParams();
  if (context.studentId) params.set('student', context.studentId);
  if (context.classId) params.set('class_id', context.classId);
  if (context.courseId) params.set('course_id', context.courseId);
  if (context.schoolId) params.set('school_id', context.schoolId);
  if (step === 'write') {
    if (context.reportId) params.set('report', context.reportId);
    if (context.term) params.set('report_term', context.term);
    if (context.period) params.set('report_period', context.period);
    if (context.from) params.set('from', context.from);
  }
  if (step === 'publish' || step === 'prepare') {
    if (context.reportId) params.set('report', context.reportId);
    if (context.term) params.set('term', context.term);
    if (context.period) params.set('year', context.period);
  }
  const query = params.toString();
  const href = LEARNER_REPORT_STEPS.find((item) => item.key === step)?.href ?? '/dashboard/results';
  return query ? `${href}?${query}` : href;
}

function contextFromSearch(search: URLSearchParams, extra: LearnerReportContext, pathname = ''): LearnerReportContext {
  return {
    studentId: extra.studentId || firstValue(search, 'student', 'student_id'),
    reportId: extra.reportId || firstValue(search, 'report', 'report_id'),
    classId: extra.classId || firstValue(search, 'class_id', 'class'),
    courseId: extra.courseId || firstValue(search, 'course_id'),
    schoolId: extra.schoolId || firstValue(search, 'school_id'),
    term: extra.term || firstValue(search, 'report_term', 'term'),
    period: extra.period || firstValue(search, 'report_period', 'year', 'period'),
    from: extra.from || firstValue(search, 'from') || (pathname.startsWith('/dashboard/academic/results') ? 'prepare' : pathname.startsWith('/dashboard/results') ? 'results' : ''),
  };
}

function StripFallback() {
  return <div className="h-14 rounded-2xl border border-border bg-card" aria-hidden />;
}

export function LearnerReportFlowStrip({
  current,
  compact = false,
  ...extra
}: LearnerReportContext & { current?: LearnerReportStep; compact?: boolean }) {
  return (
    <Suspense fallback={<StripFallback />}>
      <LearnerReportFlowStripInner current={current} compact={compact} {...extra} />
    </Suspense>
  );
}

function LearnerReportFlowStripInner({
  current,
  compact = false,
  ...extra
}: LearnerReportContext & { current?: LearnerReportStep; compact?: boolean }) {
  const pathname = usePathname() || '';
  const searchParams = useSearchParams();
  const active = current ?? stepFromPath(pathname);
  const context = contextFromSearch(searchParams ?? new URLSearchParams(), extra, pathname);
  const primarySteps = LEARNER_REPORT_STEPS.filter((step) => step.key !== 'prepare');
  const prepareStep = LEARNER_REPORT_STEPS.find((step) => step.key === 'prepare')!;
  const prepareHref = learnerReportHref('prepare', context);

  return (
    <nav aria-label="Report card workflow" className="rounded-2xl border border-border bg-card px-3 py-2.5 sm:px-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <ol className="grid min-w-0 flex-1 grid-cols-2 gap-1.5">
        {primarySteps.map((step, index) => {
          const isCurrent = step.key === active;
          const href = learnerReportHref(step.key, context);
          return (
            <li key={step.key}>
              <Link
                href={href}
                aria-current={isCurrent ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors ${
                  isCurrent
                    ? 'bg-primary/10 text-foreground'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${
                    isCurrent
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-foreground">{step.label}</span>
                  {!compact ? (
                    <span className="block truncate text-[11px] text-muted-foreground">{step.detail}</span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
        </ol>
        <Link
          href={prepareHref}
          aria-current={active === 'prepare' ? 'page' : undefined}
          className={`flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors sm:justify-start ${
            active === 'prepare'
              ? 'border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200'
              : 'border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          }`}
        >
          <span className="rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-black uppercase text-sky-700 dark:text-sky-300">Optional</span>
          <span>{prepareStep.label}</span>
          {!compact ? <span className="hidden text-[11px] font-normal text-muted-foreground lg:inline">· {prepareStep.detail}</span> : null}
        </Link>
      </div>
    </nav>
  );
}
