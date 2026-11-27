'use client';

import { useMemo, useState } from 'react';
import {
  AcademicCapIcon,
  BookOpenIcon,
  BuildingOfficeIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardDocumentListIcon,
  DocumentTextIcon,
  SparklesIcon,
} from '@/lib/icons';
import {
  alignCurriculumToSchoolCalendar,
  type AlignableCurriculumContent,
  type AlignedCurriculumWeek,
  type CanonicalAcademicTermRow,
  type SchoolDeliveryTiming,
} from '@/lib/curriculum/school-calendar-alignment';
import { humanProgrammeYear } from '@/lib/curriculum/humanLabels';

export interface CalendarSchoolOption {
  id: string;
  name: string;
}

export interface CalendarChildOption {
  id: string;
  full_name: string;
  school_id: string | null;
  school_name: string | null;
  class_id: string | null;
  current_course_id: string | null;
}

export interface SchoolAlignedCurriculumRoadmapProps {
  content: AlignableCurriculumContent | null | undefined;
  academicSession: string;
  termCalendar?: Record<string, unknown> | null;
  academicTerms?: CanonicalAcademicTermRow[] | null;
  schedule?: SchoolDeliveryTiming | null;
  schoolName?: string | null;
  selectedSchoolId?: string | null;
  schools?: CalendarSchoolOption[];
  allowPlatformOption?: boolean;
  onChangeSchoolId?: (schoolId: string) => void;
  childrenList?: CalendarChildOption[];
  selectedChildId?: string;
  onChangeChildId?: (childId: string) => void;
  audienceIsLearner?: boolean;
  onOpenWeekInBuilder?: (args: {
    year: number;
    term: number;
    week: number;
  }) => void;
}

const WEEK_BADGE: Record<
  'lesson' | 'assessment' | 'examination',
  { label: string; cls: string; icon: typeof BookOpenIcon }
> = {
  lesson: {
    label: 'Lesson',
    cls: 'border-primary/30 bg-primary/10 text-primary',
    icon: BookOpenIcon,
  },
  assessment: {
    label: 'Assessment',
    cls: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    icon: ClipboardDocumentListIcon,
  },
  examination: {
    label: 'Examination',
    cls: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    icon: DocumentTextIcon,
  },
};

const NG_TERM_NAME: Record<number, string> = {
  1: 'First Term',
  2: 'Second Term',
  3: 'Third Term',
};

export function SchoolAlignedCurriculumRoadmap({
  content,
  academicSession,
  termCalendar,
  academicTerms,
  schedule,
  schoolName,
  selectedSchoolId,
  schools = [],
  allowPlatformOption = false,
  onChangeSchoolId,
  childrenList = [],
  selectedChildId,
  onChangeChildId,
  audienceIsLearner = false,
  onOpenWeekInBuilder,
}: SchoolAlignedCurriculumRoadmapProps) {
  const roadmap = useMemo(
    () =>
      alignCurriculumToSchoolCalendar({
        content,
        academicSession,
        termCalendar,
        academicTerms,
        schedule,
      }),
    [content, academicSession, termCalendar, academicTerms, schedule],
  );

  const [selectedYear, setSelectedYear] = useState<number>(0); // 0 = All years
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(() => {
    if (roadmap.currentFocus) {
      return new Set([
        `y${roadmap.currentFocus.programmeYear}-t${roadmap.currentFocus.storedTermNumber}-w${roadmap.currentFocus.week}`,
      ]);
    }
    return new Set();
  });
  const [expandAllWeeks, setExpandAllWeeks] = useState(false);

  const visibleTerms = useMemo(
    () =>
      selectedYear === 0
        ? roadmap.terms
        : roadmap.terms.filter((t) => t.programmeYear === selectedYear),
    [roadmap.terms, selectedYear],
  );

  function toggleWeek(key: string) {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function jumpToCurrentWeek() {
    if (!roadmap.currentFocus) return;
    setSelectedYear(0);
    const key = `y${roadmap.currentFocus.programmeYear}-t${roadmap.currentFocus.storedTermNumber}-w${roadmap.currentFocus.week}`;
    setExpandedWeeks((prev) => new Set(prev).add(key));
    requestAnimationFrame(() => {
      document.getElementById(`roadmap-week-${key}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }

  const canSwitchSchool =
    Boolean(onChangeSchoolId) &&
    (schools.length > 1 || (allowPlatformOption && schools.length >= 1));

  return (
    <div className="space-y-4">
      {/* ── School Calendar Alignment Bar ── */}
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-primary">
                <CalendarDaysIcon className="h-3.5 w-3.5" />
                School Calendar Aligned
              </span>
              <span className="text-xs font-bold text-foreground">
                {schoolName || 'Standard Academic Calendar'} · {roadmap.baseAcademicSession}
              </span>
              {!roadmap.isCohortFormat && (
                <span className="rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  Starts {NG_TERM_NAME[roadmap.entryTerm] ?? `Term ${roadmap.entryTerm}`}
                  {roadmap.entryWeek > 1 ? `, School Week ${roadmap.entryWeek}` : ''}
                  {roadmap.sessionsPerWeek > 1
                    ? ` · ${roadmap.sessionsPerWeek} sessions/wk`
                    : ''}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Full curriculum scope:{' '}
              <strong className="text-foreground">
                {roadmap.years.length > 1
                  ? `${roadmap.years.length} Years · `
                  : ''}
                {roadmap.totalTerms} {roadmap.isCohortFormat ? 'Modules' : 'Terms'} ·{' '}
                {roadmap.totalWeeks} Weeks
              </strong>
              {!roadmap.isCohortFormat &&
                ' — mapped to each school term and Monday–Friday teaching week.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {childrenList.length > 1 && onChangeChildId && (
              <select
                aria-label="Select child for school calendar alignment"
                value={selectedChildId || childrenList[0]?.id || ''}
                onChange={(e) => onChangeChildId(e.target.value)}
                className="min-h-9 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground"
              >
                {childrenList.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.full_name}
                    {child.school_name ? ` (${child.school_name})` : ''}
                  </option>
                ))}
              </select>
            )}

            {canSwitchSchool && onChangeSchoolId && (
              <div className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-2.5 py-1">
                <BuildingOfficeIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <select
                  aria-label="Align curriculum to school calendar"
                  value={selectedSchoolId || (allowPlatformOption ? 'platform' : '')}
                  onChange={(e) => onChangeSchoolId(e.target.value)}
                  className="bg-transparent text-xs font-bold text-foreground focus:outline-none max-w-[220px] truncate py-0.5 cursor-pointer"
                >
                  {allowPlatformOption && (
                    <option value="platform">Standard Nigerian Calendar</option>
                  )}
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {roadmap.currentFocus && (
              <button
                type="button"
                onClick={jumpToCurrentWeek}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-3 py-2 text-xs font-black uppercase tracking-wider text-white transition-colors"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                This week (W{roadmap.currentFocus.week})
              </button>
            )}
          </div>
        </div>

        {/* Year filter + Expand/Collapse all */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
          <div className="flex flex-wrap items-center gap-1.5">
            {roadmap.years.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => setSelectedYear(0)}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition-colors ${
                    selectedYear === 0
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All Years ({roadmap.years.length})
                </button>
                {roadmap.years.map((yr) => (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => setSelectedYear(yr)}
                    className={`rounded-lg px-3 py-1 text-xs font-bold transition-colors ${
                      selectedYear === yr
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border bg-background text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {humanProgrammeYear(yr)}
                  </button>
                ))}
              </>
            ) : (
              <span className="text-xs font-bold text-muted-foreground">
                Showing complete course sequence ({roadmap.totalWeeks} weeks)
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setExpandAllWeeks((v) => !v)}
            className="text-xs font-bold text-primary hover:underline"
          >
            {expandAllWeeks ? 'Collapse week details' : 'Expand all week details'}
          </button>
        </div>
      </section>

      {/* ── Chronological Multi-Year, Multi-Term Roadmap ── */}
      {visibleTerms.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          This curriculum has no terms or weeks yet.
        </div>
      ) : (
        <section className="space-y-3" aria-label="Terms and weeks">
          {visibleTerms.map((term, termIdx) => {
            const weeks = term.weeks;
            const planned = weeks.filter((w) => w.hasPlan).length;
            const missing = weeks.length - planned;
            return (
              <details
                key={term.key}
                open={term.isCurrentTerm || termIdx === 0 || visibleTerms.length <= 6}
                className={`group rounded-2xl border bg-card overflow-hidden ${
                  term.isCurrentTerm ? 'border-emerald-500/40' : 'border-border'
                }`}
              >
                <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5 hover:bg-muted/20 transition-colors [&::-webkit-details-marker]:hidden">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {!roadmap.isCohortFormat && (
                        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-primary">
                          {humanProgrammeYear(term.programmeYear)} · Term {term.programmeTerm}
                          {term.programmeTheme ? ` (${term.programmeTheme})` : ''}
                        </span>
                      )}
                      {term.isCurrentTerm && (
                        <span className="rounded-full bg-emerald-700 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                          Current School Term
                        </span>
                      )}
                      <span className="text-xs font-bold text-muted-foreground">
                        {roadmap.isCohortFormat
                          ? term.nationalTermLabel
                          : `${term.nationalTermLabel} ${term.academicSession}`}
                        {term.dateRangeLabel ? ` · ${term.dateRangeLabel}` : ''}
                      </span>
                    </div>
                    <p className="text-sm sm:text-base font-black text-foreground">
                      {term.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {weeks.length} week{weeks.length === 1 ? '' : 's'}
                      {!audienceIsLearner && weeks.length > 0 && (
                        <>
                          {' · '}
                          <span
                            className={
                              missing > 0
                                ? 'font-bold text-amber-700 dark:text-amber-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }
                          >
                            {missing > 0
                              ? `${missing} without teaching content`
                              : 'all weeks have teaching content'}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                  <span className="text-xs font-black text-primary group-open:hidden">
                    Show weeks
                  </span>
                  <span className="hidden text-xs font-black text-primary group-open:inline">
                    Hide weeks
                  </span>
                </summary>

                <div className="border-t border-border p-3 sm:p-4 space-y-3">
                  {term.objectives.length > 0 && (
                    <div className="rounded-xl border border-border/70 bg-muted/30 px-3.5 py-2.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                        Term learning goals
                      </p>
                      <ul className="grid gap-1.5 sm:grid-cols-2 text-xs text-foreground/85">
                        {term.objectives.map((obj, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <SparklesIcon className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                            <span>{obj}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {weeks.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                      No weeks have been added to this term.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {weeks.map((week: AlignedCurriculumWeek, weekIndex: number) => {
                        const weekKey = `y${term.programmeYear}-t${term.storedTermNumber}-w${week.week}`;
                        const isExpanded = expandAllWeeks || expandedWeeks.has(weekKey);
                        const meta = WEEK_BADGE[week.type] ?? WEEK_BADGE.lesson;
                        const MetaIcon = meta.icon;
                        const isCurrent = week.timelineState === 'current';

                        return (
                          <div
                            id={`roadmap-week-${weekKey}`}
                            key={`${week.week ?? weekIndex}-${week.topic}`}
                            className={`rounded-xl border transition-colors ${
                              isCurrent
                                ? 'border-emerald-500/50 bg-emerald-500/5'
                                : 'border-border bg-background/60'
                            }`}
                          >
                            <div className="flex items-start gap-3 px-3 py-3 sm:px-4">
                              <button
                                type="button"
                                onClick={() => toggleWeek(weekKey)}
                                className="flex flex-1 min-w-0 items-start gap-3 text-left"
                              >
                                <span
                                  className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black ${
                                    isCurrent
                                      ? 'bg-emerald-700 text-white'
                                      : 'bg-primary/10 text-primary'
                                  }`}
                                >
                                  {week.week ?? weekIndex + 1}
                                </span>

                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                                      Week {week.week}
                                    </span>
                                    {week.calendarWeek !== week.week && (
                                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                                        School Wk {week.calendarWeek}
                                      </span>
                                    )}
                                    {week.dateRangeLabel && (
                                      <span className="text-[11px] font-bold text-foreground/75">
                                        · {week.dateRangeLabel}
                                      </span>
                                    )}
                                    <span
                                      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${meta.cls}`}
                                    >
                                      <MetaIcon className="h-3 w-3" />
                                      {meta.label}
                                    </span>
                                    {isCurrent && (
                                      <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
                                        This week
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm font-bold text-foreground">
                                    {week.topic || 'Topic not added yet'}
                                  </p>
                                  {week.subtopics.length > 0 && !isExpanded && (
                                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                                      {week.subtopics.join(' · ')}
                                    </p>
                                  )}
                                </div>

                                <span className="mt-1 shrink-0 text-muted-foreground">
                                  {isExpanded ? (
                                    <ChevronDownIcon className="h-4 w-4 text-primary" />
                                  ) : (
                                    <ChevronRightIcon className="h-4 w-4" />
                                  )}
                                </span>
                              </button>

                              {!audienceIsLearner && (
                                <div className="flex items-center gap-2 shrink-0 mt-0.5">
                                  {week.hasPlan ? (
                                    <CheckCircleIcon
                                      className="h-4 w-4 text-emerald-600 shrink-0"
                                      aria-label="Plan included"
                                    />
                                  ) : (
                                    <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-700 dark:text-amber-400">
                                      No teaching content
                                    </span>
                                  )}
                                  {onOpenWeekInBuilder && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onOpenWeekInBuilder({
                                          year: term.programmeYear,
                                          term: term.storedTermNumber,
                                          week: week.week,
                                        })
                                      }
                                      className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-border bg-card hover:bg-muted px-2.5 py-1 text-[10px] font-bold text-foreground"
                                    >
                                      Open guide
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>

                            {isExpanded && (
                              <WeekFullScopeDetails
                                week={week}
                                audienceIsLearner={audienceIsLearner}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </section>
      )}
    </div>
  );
}

function WeekFullScopeDetails({
  week,
  audienceIsLearner,
}: {
  week: AlignedCurriculumWeek;
  audienceIsLearner: boolean;
}) {
  const lp = week.lessonPlan;
  const ap = week.assessmentPlan;

  return (
    <div className="border-t border-border/70 bg-card/60 px-3.5 py-3.5 sm:px-5 space-y-3 text-xs sm:text-sm">
      {week.subtopics.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
            Focus areas &amp; subtopics
          </p>
          <div className="flex flex-wrap gap-1.5">
            {week.subtopics.map((sub, i) => (
              <span
                key={i}
                className="rounded-md border border-border bg-background px-2.5 py-0.5 text-xs text-foreground/85"
              >
                {sub}
              </span>
            ))}
          </div>
        </div>
      )}

      {lp && (
        <div className="grid gap-3 md:grid-cols-2">
          {lp.objectives && lp.objectives.length > 0 && (
            <div className="rounded-xl border border-border/70 bg-background p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1.5">
                Learning objectives
              </p>
              <ul className="space-y-1 text-xs text-foreground/90">
                {lp.objectives.map((obj, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-emerald-700 dark:text-emerald-400 font-black">✓</span>
                    <span>{obj}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lp.student_activities && lp.student_activities.length > 0 && (
            <div className="rounded-xl border border-border/70 bg-background p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1.5">
                {audienceIsLearner ? 'What you will build & practise' : 'Learner activities'}
              </p>
              <ul className="space-y-1 text-xs text-foreground/90">
                {lp.student_activities.map((act, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-primary font-bold">{i + 1}.</span>
                    <span>{act}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!audienceIsLearner && lp.teacher_activities && lp.teacher_activities.length > 0 && (
            <div className="rounded-xl border border-border/70 bg-background p-3 md:col-span-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">
                Teacher delivery steps
              </p>
              <ul className="grid gap-1 sm:grid-cols-2 text-xs text-foreground/85">
                {lp.teacher_activities.map((act, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-muted-foreground font-bold">{i + 1}.</span>
                    <span>{act}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lp.classwork && (lp.classwork.title || lp.classwork.instructions) && (
            <div className="rounded-xl border border-border/70 bg-background p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Hands-on classwork
              </p>
              {lp.classwork.title && (
                <p className="text-xs font-black text-foreground mt-0.5">{lp.classwork.title}</p>
              )}
              {lp.classwork.instructions && (
                <p className="text-xs text-muted-foreground mt-1">{lp.classwork.instructions}</p>
              )}
            </div>
          )}

          {lp.assignment && (lp.assignment.title || lp.assignment.instructions) && (
            <div className="rounded-xl border border-sky-500/25 bg-sky-500/5 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-sky-700 dark:text-sky-300">
                Assignment
              </p>
              {lp.assignment.title && (
                <p className="text-xs font-black text-foreground mt-0.5">{lp.assignment.title}</p>
              )}
              {lp.assignment.instructions && (
                <p className="text-xs text-foreground/85 mt-1">{lp.assignment.instructions}</p>
              )}
            </div>
          )}

          {lp.project && (lp.project.title || lp.project.description) && (
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 md:col-span-2">
              <div className="flex items-center gap-1.5">
                <AcademicCapIcon className="h-3.5 w-3.5 text-primary" />
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                  Practical project
                </p>
              </div>
              {lp.project.title && (
                <p className="text-xs font-black text-foreground mt-0.5">{lp.project.title}</p>
              )}
              {lp.project.description && (
                <p className="text-xs text-foreground/85 mt-1">{lp.project.description}</p>
              )}
            </div>
          )}
        </div>
      )}

      {ap && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-800 dark:text-amber-300">
            {ap.title || 'Assessment checkpoint'}
            {ap.format ? ` · ${ap.format}` : ''}
            {ap.duration_minutes ? ` · ${ap.duration_minutes} mins` : ''}
          </p>
          {ap.coverage && ap.coverage.length > 0 && (
            <p className="text-xs text-foreground/85">
              <strong>Topics covered:</strong> {ap.coverage.join(', ')}
            </p>
          )}
          {!audienceIsLearner && ap.scoring_guide && (
            <p className="text-xs text-muted-foreground">
              <strong>Scoring guide:</strong> {ap.scoring_guide}
            </p>
          )}
        </div>
      )}

      {!lp && !ap && week.subtopics.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Detailed lesson notes for this week will appear once published for this course.
        </p>
      )}
    </div>
  );
}
