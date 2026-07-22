'use client';

import { formatCourseDisplay, formatProgrammeDisplay } from '@/lib/school-reports/display-labels';
import type { TopicsCoveredPresentation } from '@/lib/school-reports/topics-covered-presentation';
import { cleanTopicTitle } from '@/lib/school-reports/topics-covered-presentation';

type EnrolledCourse = {
  programme: string;
  course: string;
  enrolledStudents?: number;
};

type Props = {
  presentation: TopicsCoveredPresentation;
  enrolledCourses?: EnrolledCourse[];
  /** Standalone = builder panel; embedded = inside live book preview */
  variant?: 'standalone' | 'embedded';
  /** Optional grid override for embedded course cards */
  courseGridClass?: string;
};

export function WhatWeTaughtPreview({
  presentation,
  enrolledCourses = [],
  variant = 'standalone',
  courseGridClass,
}: Props) {
  const courseCards = presentation.sections.flatMap((section) =>
    section.courses.map((course) => ({
      programme: formatProgrammeDisplay(section.programme),
      course: formatCourseDisplay(course.course),
      topics: course.topics.map((topic) => cleanTopicTitle(topic.label, course.course)),
    })),
  );

  const enrolledLabels = enrolledCourses
    .filter((row) => (row.enrolledStudents ?? 0) > 0)
    .map((row) => `${formatProgrammeDisplay(row.programme)} · ${formatCourseDisplay(row.course)}`);

  const embedded = variant === 'embedded';

  return (
    <div
      className={
        embedded
          ? 'space-y-3'
          : 'overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.06] via-background to-background shadow-sm'
      }
    >
      {!embedded ? (
        <div className="border-b border-primary/15 bg-primary/[0.08] px-3 py-3 sm:px-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">What we taught</p>
          {enrolledLabels.length ? (
            <div className="mt-2 space-y-2">
              <p className="text-[11px] text-muted-foreground">
                {enrolledLabels.length} course{enrolledLabels.length === 1 ? '' : 's'} in scope
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {enrolledLabels.map((label) => (
                  <li
                    key={label}
                    className="max-w-full rounded-full border border-border/70 bg-background/90 px-2.5 py-1 text-[10px] font-semibold leading-snug text-foreground break-words"
                  >
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : enrolledLabels.length ? (
        <p className="text-xs text-muted-foreground">
          {enrolledLabels.length} course{enrolledLabels.length === 1 ? '' : 's'}:{' '}
          {enrolledLabels.join(' · ')}
        </p>
      ) : null}

      <div className={embedded ? 'space-y-3' : 'space-y-4 p-3 sm:p-4'}>
        <p className={`leading-relaxed text-foreground break-words ${embedded ? 'text-sm' : 'text-sm'}`}>
          {presentation.intro}
        </p>

        {courseCards.length ? (
          <div
            className={
              courseGridClass ||
              `grid grid-cols-1 gap-3 ${courseCards.length >= 2 ? 'sm:grid-cols-2' : ''} ${
                courseCards.length >= 3 ? 'lg:grid-cols-3' : ''
              }`
            }
          >
            {courseCards.map((item) => (
              <article
                key={`${item.programme}-${item.course}`}
                className={`min-w-0 rounded-xl border bg-card/90 p-3 ${
                  embedded ? 'border-border/70' : 'border-border/80 shadow-sm sm:p-3.5'
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-wide text-primary break-words">{item.programme}</p>
                <h4 className={`mt-1 font-black text-foreground break-words ${embedded ? 'text-sm' : 'text-sm'}`}>
                  {item.course}
                </h4>
                {item.topics.length ? (
                  <ul className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
                    {item.topics.map((topic) => (
                      <li
                        key={`${item.course}-${topic}`}
                        className={`flex gap-2 leading-snug text-foreground ${embedded ? 'text-xs' : 'text-[12px]'}`}
                      >
                        <span className="mt-0.5 shrink-0 font-black text-primary">•</span>
                        <span className="min-w-0 break-words">{topic}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}

        {presentation.pacingLine ? (
          <p
            className={`italic leading-relaxed text-muted-foreground break-words ${
              embedded
                ? 'text-xs'
                : 'rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs'
            }`}
          >
            {presentation.pacingLine}
          </p>
        ) : null}

        {presentation.closing ? (
          <p
            className={`leading-relaxed break-words ${
              embedded
                ? 'text-xs italic text-muted-foreground'
                : 'rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-950 dark:text-amber-100'
            }`}
          >
            {presentation.closing}
          </p>
        ) : null}
      </div>
    </div>
  );
}
