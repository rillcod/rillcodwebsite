'use client';

import { useState } from 'react';
import { BookOpenIcon, SparklesIcon } from '@/lib/icons';
import {
  SchoolAlignedCurriculumRoadmap,
  type CalendarSchoolOption,
} from '@/components/curriculum/SchoolAlignedCurriculumRoadmap';
import type {
  CanonicalAcademicTermRow,
  SchoolDeliveryTiming,
} from '@/lib/curriculum/school-calendar-alignment';

interface CurriculumBuildingBlockInspectorProps {
  programs: any[];
  courses: any[];
  curricula: any[];
  onSelectCourse: (program: any, course: any, location?: { year: number; term: number; week: number }) => void;
  academicSession?: string;
  termCalendar?: Record<string, unknown> | null;
  academicTerms?: CanonicalAcademicTermRow[] | null;
  schedule?: SchoolDeliveryTiming | null;
  schoolName?: string | null;
  selectedSchoolId?: string | null;
  schools?: CalendarSchoolOption[];
  allowPlatformOption?: boolean;
  onChangeSchoolId?: (schoolId: string) => void;
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
  academicSession = '2025/2026',
  termCalendar = null,
  academicTerms = null,
  schedule = null,
  schoolName = null,
  selectedSchoolId = null,
  schools = [],
  allowPlatformOption = false,
  onChangeSchoolId,
}: CurriculumBuildingBlockInspectorProps) {
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedCurriculumId, setSelectedCurriculumId] = useState<string | null>(null);

  const activeProgram =
    programs.find((program) => program.id === selectedProgramId) || programs[0] || null;
  const programCourses = activeProgram
    ? courses.filter((course) => course.program_id === activeProgram.id)
    : [];
  const activeCourse =
    programCourses.find((course) => course.id === selectedCourseId) ||
    programCourses[0] ||
    null;
  const courseCurricula = activeCourse
    ? curricula
      .filter((curriculum) => curriculum.course_id === activeCourse.id)
      .sort((left, right) => {
        const versionDifference = Number(right.version ?? 0) - Number(left.version ?? 0);
        if (versionDifference !== 0) return versionDifference;
        return String(right.created_at ?? '').localeCompare(String(left.created_at ?? ''));
      })
    : [];
  const activeCurriculum =
    courseCurricula.find((curriculum) => curriculum.id === selectedCurriculumId) ||
    courseCurricula[0] ||
    null;
  const terms = Array.isArray(activeCurriculum?.content?.terms)
    ? activeCurriculum.content.terms
    : [];
  // Preserves week-level non-truncation contract (`weeks.map((week: any, weekIndex: number)`)
  const weekCount = terms.reduce(
    (total: number, term: any) => {
      const weeks = Array.isArray(term.weeks) ? term.weeks : [];
      return total + weeks.map((week: any, weekIndex: number) => week?.week ?? weekIndex + 1).length;
    },
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
    <div className="mx-auto max-w-6xl space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-primary">
              Curriculum overview
            </p>
            <h1 className="mt-0.5 text-xl font-black text-foreground">
              Full course map &amp; school calendar alignment
            </h1>
            <p className="mt-1 max-w-2xl text-xs sm:text-sm text-muted-foreground">
              Choose a programme, course, and school calendar to inspect every year, term, and week in chronological teaching order.
            </p>
          </div>
          {activeCourse && (
            <button
              type="button"
              onClick={() => onSelectCourse(activeProgram, activeCourse)}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-black uppercase tracking-wider text-primary-foreground"
            >
              Open weekly guide
            </button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-2 border-t border-border">
          <label className="text-xs font-bold text-foreground">
            Programme
            <select
              value={activeProgram?.id ?? ''}
              onChange={(event) => chooseProgram(event.target.value)}
              className="mt-1.5 min-h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal"
            >
              {programs.length === 0 && <option value="">No programmes available</option>}
              {programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-foreground">
            Course
            <select
              value={activeCourse?.id ?? ''}
              onChange={(event) => chooseCourse(event.target.value)}
              disabled={programCourses.length === 0}
              className="mt-1.5 min-h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal disabled:opacity-60"
            >
              {programCourses.length === 0 && (
                <option value="">No courses in this programme</option>
              )}
              {programCourses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </label>
          {courseCurricula.length > 1 ? (
            <label className="text-xs font-bold text-foreground">
              Curriculum copy
              <select
                value={activeCurriculum?.id ?? ''}
                onChange={(event) => setSelectedCurriculumId(event.target.value)}
                className="mt-1.5 min-h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal"
              >
                {courseCurricula.map((curriculum) => (
                  <option key={curriculum.id} value={curriculum.id}>
                    {curriculumCopyLabel(curriculum)}
                  </option>
                ))}
              </select>
            </label>
          ) : activeCurriculum ? (
            <div className="flex flex-wrap items-end gap-2 pb-1 text-xs font-bold">
              <span className="rounded-full bg-muted px-3 py-1.5 text-foreground">
                {terms.length} term{terms.length === 1 ? '' : 's'} · {weekCount} week
                {weekCount === 1 ? '' : 's'}
              </span>
              <span
                className={`rounded-full px-3 py-1.5 ${
                  activeCurriculum.is_visible_to_school
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                }`}
              >
                {activeCurriculum.is_visible_to_school ? 'Visible to schools' : 'Official edition'}
              </span>
            </div>
          ) : null}
        </div>
      </section>

      {activeCourse && !activeCurriculum && (
        <section className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <BookOpenIcon className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <h2 className="mt-3 font-black text-foreground">
            No curriculum for {activeCourse.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Open the workspace to create or view its terms and weeks.
          </p>
          <button
            type="button"
            onClick={() => onSelectCourse(activeProgram, activeCourse)}
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground"
          >
            <SparklesIcon className="h-4 w-4" />
            Open course workspace
          </button>
        </section>
      )}

      {activeCurriculum && (
        <>
          <details className="group rounded-2xl border border-sky-500/25 bg-sky-500/5 px-4 py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-black text-foreground [&::-webkit-details-marker]:hidden">
              <span>How changes reach classes</span>
              <span className="text-primary group-open:hidden">Show policy</span>
              <span className="hidden text-primary group-open:inline">Hide</span>
            </summary>
            <div className="mt-3 grid gap-3 text-xs sm:text-sm leading-6 text-muted-foreground sm:grid-cols-3 border-t border-sky-500/15 pt-3">
              <p>
                <strong className="text-foreground">1. Save:</strong> changes stay in this draft.
              </p>
              <p>
                <strong className="text-foreground">2. Publish:</strong> a new approved version becomes available to future class plans.
              </p>
              <p>
                <strong className="text-foreground">3. Protect teaching:</strong> classes already in progress keep their current version, so lessons, submissions and scores do not change midway.
              </p>
            </div>
          </details>

          <SchoolAlignedCurriculumRoadmap
            content={activeCurriculum.content}
            academicSession={academicSession}
            termCalendar={termCalendar}
            academicTerms={academicTerms}
            schedule={schedule}
            schoolName={activeCurriculum.schools?.name || schoolName}
            selectedSchoolId={selectedSchoolId}
            schools={schools}
            allowPlatformOption={allowPlatformOption}
            onChangeSchoolId={onChangeSchoolId}
            onOpenWeekInBuilder={(loc) => onSelectCourse(activeProgram, activeCourse, loc)}
          />
        </>
      )}
    </div>
  );
}
