'use client';

import { useState } from 'react';
import { BookOpenIcon, CheckCircleIcon, SparklesIcon } from '@/lib/icons';

interface CurriculumBuildingBlockInspectorProps {
  programs: any[];
  courses: any[];
  curricula: any[];
  onSelectCourse: (program: any, course: any) => void;
}

function curriculumCopyLabel(curriculum: any) {
  const owner = curriculum.schools?.name || 'Shared curriculum';
  return `${owner} · Version ${curriculum.version ?? 1}`;
}

export function CurriculumBuildingBlockInspector({
  programs,
  courses,
  curricula,
  onSelectCourse,
}: CurriculumBuildingBlockInspectorProps) {
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedCurriculumId, setSelectedCurriculumId] = useState<string | null>(null);

  const activeProgram = programs.find((program) => program.id === selectedProgramId)
    || programs[0]
    || null;
  const programCourses = activeProgram
    ? courses.filter((course) => course.program_id === activeProgram.id)
    : [];
  const activeCourse = programCourses.find((course) => course.id === selectedCourseId)
    || programCourses[0]
    || null;
  const courseCurricula = activeCourse
    ? curricula
        .filter((curriculum) => curriculum.course_id === activeCourse.id)
        .sort((left, right) => {
          const versionDifference = Number(right.version ?? 0) - Number(left.version ?? 0);
          if (versionDifference !== 0) return versionDifference;
          return String(right.created_at ?? '').localeCompare(String(left.created_at ?? ''));
        })
    : [];
  const activeCurriculum = courseCurricula.find((curriculum) => curriculum.id === selectedCurriculumId)
    || courseCurricula[0]
    || null;
  const terms = Array.isArray(activeCurriculum?.content?.terms)
    ? activeCurriculum.content.terms
    : [];
  const weekCount = terms.reduce(
    (total: number, term: any) => total + (Array.isArray(term.weeks) ? term.weeks.length : 0),
    0,
  );

  function chooseProgram(programId: string) {
    setSelectedProgramId(programId);
    const firstCourse = courses.find((course) => course.program_id === programId);
    setSelectedCourseId(firstCourse?.id ?? null);
    setSelectedCurriculumId(null);
  }

  function chooseCourse(courseId: string) {
    setSelectedCourseId(courseId);
    setSelectedCurriculumId(null);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <p className="text-xs font-black uppercase tracking-widest text-primary">Curriculum overview</p>
        <h1 className="mt-2 text-2xl font-black text-foreground">See the full learning journey</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Choose a programme and course to read every term and week in order. Open the editor only when you need to change the plan.
        </p>
      </header>

      <section className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
        <label className="text-sm font-bold text-foreground">
          Programme
          <select
            value={activeProgram?.id ?? ''}
            onChange={(event) => chooseProgram(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal"
          >
            {programs.length === 0 && <option value="">No programmes available</option>}
            {programs.map((program) => (
              <option key={program.id} value={program.id}>{program.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold text-foreground">
          Course
          <select
            value={activeCourse?.id ?? ''}
            onChange={(event) => chooseCourse(event.target.value)}
            disabled={programCourses.length === 0}
            className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal disabled:opacity-60"
          >
            {programCourses.length === 0 && <option value="">No courses in this programme</option>}
            {programCourses.map((course) => (
              <option key={course.id} value={course.id}>{course.title}</option>
            ))}
          </select>
        </label>
      </section>

      {activeCourse && !activeCurriculum && (
        <section className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <BookOpenIcon className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <h2 className="mt-3 font-black text-foreground">No curriculum for {activeCourse.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Open the editor to create its terms and weeks.</p>
          <button
            type="button"
            onClick={() => onSelectCourse(activeProgram, activeCourse)}
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground"
          >
            <SparklesIcon className="h-4 w-4" />
            Open editor
          </button>
        </section>
      )}

      {activeCurriculum && (
        <>
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-widest text-primary">
                  {activeProgram?.name || 'Programme'}
                </p>
                <h2 className="mt-1 text-xl font-black text-foreground">{activeCourse.title}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {activeCurriculum.content?.overview
                    || activeCurriculum.content?.description
                    || activeCurriculum.description
                    || 'The approved sequence of learning for this course.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                  <span className="rounded-full bg-muted px-3 py-1 text-foreground">
                    {terms.length} term{terms.length === 1 ? '' : 's'}
                  </span>
                  <span className="rounded-full bg-muted px-3 py-1 text-foreground">
                    {weekCount} week{weekCount === 1 ? '' : 's'}
                  </span>
                  <span className={`rounded-full px-3 py-1 ${activeCurriculum.is_visible_to_school ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>
                    {activeCurriculum.is_visible_to_school ? 'Visible to schools' : 'Draft'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSelectCourse(activeProgram, activeCourse)}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground"
              >
                Open editor
              </button>
            </div>

            {courseCurricula.length > 1 && (
              <label className="mt-5 block max-w-md text-sm font-bold text-foreground">
                Curriculum copy
                <select
                  value={activeCurriculum.id}
                  onChange={(event) => setSelectedCurriculumId(event.target.value)}
                  className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal"
                >
                  {courseCurricula.map((curriculum) => (
                    <option key={curriculum.id} value={curriculum.id}>
                      {curriculumCopyLabel(curriculum)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </section>

          <section className="rounded-2xl border border-sky-500/25 bg-sky-500/5 p-5">
            <h2 className="font-black text-foreground">How changes reach classes</h2>
            <div className="mt-3 grid gap-3 text-sm leading-6 text-muted-foreground sm:grid-cols-3">
              <p><strong className="text-foreground">1. Save:</strong> changes stay in this draft.</p>
              <p><strong className="text-foreground">2. Publish:</strong> a new approved version becomes available to future class plans.</p>
              <p><strong className="text-foreground">3. Protect teaching:</strong> classes already in progress keep their current version, so lessons, submissions and scores do not change midway.</p>
            </div>
          </section>

          <section className="space-y-3" aria-label="Terms and weeks">
            {terms.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
                This curriculum has no terms or weeks yet. Open the editor to add them.
              </div>
            ) : terms.map((term: any, index: number) => {
              const weeks = Array.isArray(term.weeks) ? term.weeks : [];
              /*
               * How many weeks actually carry teaching content.
               *
               * A week used to show a green tick when it had a plan and NOTHING
               * when it did not, so a term where every week was empty looked
               * like an ordinary list of topics. Creative Coding with Scratch
               * sat exactly like that — thirty titled weeks, no lesson plan on
               * any of them, taught by forty classes — and the screen gave the
               * office no reason to look twice. Silence is not a status.
               */
              const planned = weeks.filter(
                (week: any) => week?.lesson_plan || week?.assessment_plan,
              ).length;
              const missing = weeks.length - planned;
              return (
                <details key={`${term.term ?? index}-${term.year ?? ''}`} open={index === 0} className="group rounded-2xl border border-border bg-card">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">
                      <span className="block font-black text-foreground">
                        {term.title || `Term ${term.term ?? index + 1}`}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {weeks.length} week{weeks.length === 1 ? '' : 's'}
                        {weeks.length > 0 && (
                          <>
                            {' · '}
                            <span className={missing > 0 ? 'font-bold text-amber-600 dark:text-amber-500' : 'text-emerald-600 dark:text-emerald-500'}>
                              {missing > 0
                                ? `${missing} without teaching content`
                                : 'all weeks have teaching content'}
                            </span>
                          </>
                        )}
                      </span>
                    </span>
                    <span className="text-xs font-black text-primary group-open:hidden">Show weeks</span>
                    <span className="hidden text-xs font-black text-primary group-open:inline">Hide weeks</span>
                  </summary>
                  <div className="space-y-2 border-t border-border p-3 sm:p-4">
                    {weeks.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No weeks have been added to this term.</p>
                    ) : weeks.map((week: any, weekIndex: number) => (
                      <div key={`${week.week ?? weekIndex}-${week.topic ?? ''}`} className="flex items-start gap-3 rounded-xl border border-border px-3 py-3 sm:px-4">
                        <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-black text-primary">
                          {week.week ?? weekIndex + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-foreground">{week.topic || 'Topic not added yet'}</p>
                          {(week.subtopics ?? []).length > 0 && (
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{week.subtopics.join(' · ')}</p>
                          )}
                        </div>
                        {week.lesson_plan || week.assessment_plan ? (
                          <CheckCircleIcon className="mt-1 h-4 w-4 shrink-0 text-emerald-600" aria-label="Plan included" />
                        ) : (
                          /*
                            Say it rather than showing nothing. A missing tick is
                            indistinguishable from a list that was never meant to
                            have ticks, which is how thirty empty weeks went
                            unnoticed. Text, not just colour, so it survives a
                            screen reader and a colour-blind reader alike.
                          */
                          <span className="mt-0.5 shrink-0 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-400">
                            No teaching content
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
