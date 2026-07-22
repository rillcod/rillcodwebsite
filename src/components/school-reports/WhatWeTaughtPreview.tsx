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
};

export function WhatWeTaughtPreview({ presentation, enrolledCourses = [] }: Props) {
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

  return (
    <div className="overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.06] via-background to-background shadow-sm">
      <div className="border-b border-primary/15 bg-primary/[0.08] px-4 py-3">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
          What we taught
        </p>
        {enrolledLabels.length ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {enrolledLabels.length} course{enrolledLabels.length === 1 ? '' : 's'} in scope:{' '}
            <span className="font-semibold text-foreground">{enrolledLabels.join('  ·  ')}</span>
          </p>
        ) : null}
      </div>

      <div className="space-y-4 p-4">
        <p className="text-sm leading-relaxed text-foreground">{presentation.intro}</p>

        {courseCards.length ? (
          <div
            className={`grid gap-3 ${
              courseCards.length === 2
                ? 'md:grid-cols-2'
                : courseCards.length >= 3
                  ? 'sm:grid-cols-2 lg:grid-cols-3'
                  : 'grid-cols-1'
            }`}
          >
            {courseCards.map((item) => (
              <article
                key={`${item.programme}-${item.course}`}
                className="rounded-xl border border-border/80 bg-card/90 p-3.5 shadow-sm"
              >
                <p className="text-[10px] font-black uppercase tracking-wide text-primary">{item.programme}</p>
                <h4 className="mt-1 text-sm font-black text-foreground">{item.course}</h4>
                {item.topics.length ? (
                  <ul className="mt-3 space-y-2 border-t border-border/60 pt-3">
                    {item.topics.map((topic) => (
                      <li key={`${item.course}-${topic}`} className="flex gap-2 text-[12px] leading-snug text-foreground">
                        <span className="mt-0.5 shrink-0 font-black text-primary">•</span>
                        <span>{topic}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 border-t border-border/60 pt-3 text-[11px] italic text-muted-foreground">
                    Topics will appear after you tick delivery below and apply.
                  </p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[11px] text-muted-foreground">
            Tick module topics in the delivery picker below, then apply to populate this section.
          </p>
        )}

        {presentation.pacingLine ? (
          <p className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-[11px] italic leading-relaxed text-muted-foreground">
            {presentation.pacingLine}
          </p>
        ) : null}

        {presentation.closing ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[11px] leading-relaxed text-amber-950 dark:text-amber-100">
            {presentation.closing}
          </p>
        ) : null}
      </div>
    </div>
  );
}
