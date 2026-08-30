import { currentDeliveryWeek } from '@/lib/academic/delivery-calendar';
import { assetMeetingSession } from '@/lib/academic/session-identity';
import { canLearnerSeeSharedWeek } from '@/lib/academic/shared-content-visibility';
import { rowMatchesTeachingPeriod } from '@/lib/academic/teaching-period';
import {
  academicWeekNumber,
  lessonVisibility,
} from '@/lib/academic/week-package';

type LessonScopeDb = {
  from: (table: string) => any;
};

export type ClassPlanScopeOpts = {
  classId: string;
  termId?: string | null;
  offeringPeriodId?: string | null;
  currentCourseId?: string | null;
};

export type VisibleLessonOpts = {
  /** Calendar week this class is in today. Future live catalogue weeks stay closed. */
  currentWeek?: number | null;
};

export type LearnerClassWeek = {
  currentWeek: number;
  week: number | null;
  thisWeekLessons: any[];
  lessons: any[];
};

export type LearnerPackageAvailability = {
  lesson: true;
  slides: boolean;
  practice: boolean;
  assignment: boolean;
  project: boolean;
  availableCount: number;
};

type LearnerPackageRows = {
  slides?: readonly any[];
  flashcards?: readonly any[];
  assignments?: readonly any[];
};

export function lessonPlanIdOf(lesson: any): string | null {
  // Canonical column first — generators write lesson_plan_id directly.
  const column = lesson?.lesson_plan_id;
  if (typeof column === 'string' && column.trim()) return column.trim();
  return null;
}

function asOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function weeksReleasedOnPlan(lessons: readonly any[], planId: string): number {
  let max = 0;
  for (const lesson of lessons) {
    if (lessonPlanIdOf(lesson) !== planId) continue;
    if (lessonVisibility(lesson) !== 'live') continue;
    const week = academicWeekNumber(lesson);
    if (week != null && week > max) max = week;
  }
  return max;
}

/** A class cannot be "on" a week the calendar has not reached, even if it is live. */
export function releasedWeekCap(
  liveMaxOnPlan: number,
  currentWeek?: number | null,
): number {
  if (currentWeek == null || currentWeek < 1) return liveMaxOnPlan;
  return Math.min(liveMaxOnPlan, currentWeek);
}

/** The week this class is actually on: latest live week at or before today. */
export function thisWeekNumber(
  lessons: readonly any[],
  currentWeek: number,
): number | null {
  let best: number | null = null;
  for (const lesson of lessons) {
    const week = academicWeekNumber(lesson);
    if (week == null || week > currentWeek) continue;
    if (best == null || week > best) best = week;
  }
  return best;
}

export function lessonsOnWeek(
  lessons: readonly any[],
  week: number | null,
): any[] {
  if (week == null) return [];
  return sortLessonsByClassWeek(
    lessons.filter((lesson) => academicWeekNumber(lesson) === week),
  );
}

export function selectClassPlansForScope(
  plans: readonly any[],
  opts: ClassPlanScopeOpts,
): any[] {
  const classId = String(opts.classId ?? '').trim();
  if (!classId) return [];
  const courseId = String(opts.currentCourseId ?? '').trim();
  return (plans ?? []).filter((plan) => {
    if (String(plan?.class_id ?? '') && String(plan.class_id) !== classId) return false;
    if (String(plan?.status ?? '').toLowerCase() === 'archived') return false;
    if (courseId && String(plan?.course_id ?? '') !== courseId) return false;
    return rowMatchesTeachingPeriod(plan, {
      term_id: opts.termId,
      offering_period_id: opts.offeringPeriodId,
    });
  });
}

export function compareLessonsByClassWeek(a: any, b: any): number {
  const weekCmp =
    (academicWeekNumber(a) ?? Number.MAX_SAFE_INTEGER) -
    (academicWeekNumber(b) ?? Number.MAX_SAFE_INTEGER);
  if (weekCmp !== 0) return weekCmp;

  const sessionCmp = assetMeetingSession(a) - assetMeetingSession(b);
  if (sessionCmp !== 0) return sessionCmp;

  const orderA = a?.order_index;
  const orderB = b?.order_index;
  const aHas = Number.isFinite(Number(orderA));
  const bHas = Number.isFinite(Number(orderB));
  if (aHas && bHas) {
    const orderCmp = Number(orderA) - Number(orderB);
    if (orderCmp !== 0) return orderCmp;
  } else if (aHas !== bHas) {
    return aHas ? -1 : 1;
  }

  return String(a?.title ?? '').localeCompare(String(b?.title ?? ''), undefined, {
    sensitivity: 'base',
  });
}

export function sortLessonsByClassWeek(lessons: readonly any[]): any[] {
  return [...lessons].sort(compareLessonsByClassWeek);
}

export function nextLessonInClassOrder(
  lessons: readonly any[],
  completedIds: ReadonlySet<string>,
): any | null {
  const ordered = sortLessonsByClassWeek(lessons);
  if (ordered.length === 0) return null;
  return ordered.find((lesson) => !completedIds.has(lesson.id)) ?? ordered[ordered.length - 1] ?? null;
}

/** Match one child asset to one teaching session using the canonical identity. */
export function learningAssetMatchesLesson(row: any, lesson: any): boolean {
  const rowLessonId = String(row?.lesson_id ?? '').trim();
  if (rowLessonId) return rowLessonId === String(lesson?.id ?? '').trim();

  const rowPlanId = String(row?.lesson_plan_id ?? '').trim();
  const lessonPlanId = lessonPlanIdOf(lesson);
  if (!rowPlanId || !lessonPlanId || rowPlanId !== lessonPlanId) return false;
  if (academicWeekNumber(row) !== academicWeekNumber(lesson)) return false;
  return assetMeetingSession(row) === assetMeetingSession(lesson);
}

function isProjectRow(row: any): boolean {
  return (
    String(row?.assignment_type ?? '').toLowerCase() === 'project' &&
    row?.metadata?.source !== 'week-ai-generator'
  );
}

/**
 * Add the real learner-visible contents of each shared teaching session.
 * The dashboard uses this instead of advertising five items unconditionally.
 */
export function attachLearnerPackageAvailability(
  lessons: readonly any[],
  rows: LearnerPackageRows,
): any[] {
  return lessons.map((lesson) => {
    const linkedAssignments = (rows.assignments ?? []).filter((row) =>
      learningAssetMatchesLesson(row, lesson),
    );
    const availability: LearnerPackageAvailability = {
      lesson: true,
      slides: (rows.slides ?? []).some((row) =>
        learningAssetMatchesLesson(row, lesson),
      ),
      practice: (rows.flashcards ?? []).some((row) =>
        learningAssetMatchesLesson(row, lesson),
      ),
      assignment: linkedAssignments.some((row) => !isProjectRow(row)),
      project: linkedAssignments.some(isProjectRow),
      availableCount: 1,
    };
    availability.availableCount = [
      availability.lesson,
      availability.slides,
      availability.practice,
      availability.assignment,
      availability.project,
    ].filter(Boolean).length;
    return { ...lesson, learner_package: availability };
  });
}

/**
 * Live lessons on this class's teaching plan. Catalogue leftovers are dropped
 * when the class has a plan. Shared-release rows also pass canLearnerSeeSharedWeek
 * so another edition cannot leak in. Weeks after the class calendar stay closed.
 */
export function visibleLessonsOnClassPlans(
  lessons: readonly any[],
  plans: readonly any[],
  classId: string,
  opts?: VisibleLessonOpts,
): any[] {
  const cid = String(classId ?? '').trim();
  if (!cid || plans.length === 0) return [];

  const currentWeek =
    opts?.currentWeek != null && opts.currentWeek > 0 ? opts.currentWeek : null;
  const plansById = new Map(plans.map((plan) => [plan.id, plan]));
  const releasedByPlan = new Map(
    plans.map((plan) => [
      plan.id,
      releasedWeekCap(weeksReleasedOnPlan(lessons, plan.id), currentWeek),
    ]),
  );

  const visible = lessons.filter((lesson) => {
    if (lessonVisibility(lesson) !== 'live') return false;
    const planId = lessonPlanIdOf(lesson);
    if (!planId) return false;
    const plan = plansById.get(planId);
    if (!plan) return false;

    const week = academicWeekNumber(lesson);
    if (week == null) return false;
    if (currentWeek != null && week > currentWeek) return false;

    const lessonRelease = String(lesson.curriculum_release_id ?? '').trim();
    if (!lessonRelease) return true;

    return canLearnerSeeSharedWeek(
      {
        curriculum_release_id: lessonRelease,
        curriculum_week_number: week,
      },
      {
        classId: cid,
        adoptedReleaseId: plan.curriculum_release_id,
        weeksReleasedToLearners: releasedByPlan.get(plan.id) ?? 0,
      },
    );
  });

  return sortLessonsByClassWeek(visible);
}

function currentWeekFromClass(klass: any): number {
  const term = asOne(klass?.academic_terms);
  const period = asOne(klass?.academic_offering_periods);
  return currentDeliveryWeek({
    termStart: term?.start_date ?? null,
    periodStart: period?.starts_on ?? null,
  });
}

export async function filterLessonsForClassPlans(
  db: LessonScopeDb,
  lessons: any[],
  classId?: string | null,
  termId?: string | null,
  opts?: {
    offeringPeriodId?: string | null;
    currentCourseId?: string | null;
  },
) {
  const cid = String(classId ?? '').trim();
  if (!cid) return lessons;
  if (lessons.length === 0) return [];

  const [{ data: plans }, { data: klass }] = await Promise.all([
    db
      .from('lesson_plans')
      .select('id, class_id, course_id, term_id, offering_period_id, curriculum_release_id, status')
      .eq('class_id', cid),
    db
      .from('classes')
      .select(
        'term_id, offering_period_id, current_course_id, academic_terms(start_date), academic_offering_periods(starts_on)',
      )
      .eq('id', cid)
      .maybeSingle(),
  ]);

  const scoped = selectClassPlansForScope(plans ?? [], {
    classId: cid,
    termId: termId ?? klass?.term_id,
    offeringPeriodId: opts?.offeringPeriodId ?? klass?.offering_period_id,
    currentCourseId: opts?.currentCourseId ?? klass?.current_course_id,
  });
  return visibleLessonsOnClassPlans(lessons, scoped, cid, {
    currentWeek: currentWeekFromClass(klass),
  });
}

const LESSON_SELECT =
  'id, title, status, course_id, lesson_plan_id, curriculum_week_number, curriculum_release_id, session_number, order_index, metadata, courses(id, title, program_id, programs(name))';

const CLASS_SELECT =
  'term_id, offering_period_id, current_course_id, academic_terms(start_date), academic_offering_periods(starts_on)';

/** This class, this term: live weeks the teacher has shared, up to today's calendar week. */
export async function loadLearnerClassWeek(
  db: LessonScopeDb,
  classId?: string | null,
): Promise<LearnerClassWeek> {
  const cid = String(classId ?? '').trim();
  const empty: LearnerClassWeek = {
    currentWeek: 1,
    week: null,
    thisWeekLessons: [],
    lessons: [],
  };
  if (!cid) return empty;

  const { data: klass, error: classError } = await db
    .from('classes')
    .select(CLASS_SELECT)
    .eq('id', cid)
    .maybeSingle();
  if (classError) throw classError;

  const currentWeek = currentWeekFromClass(klass);

  const { data: planRows, error: planError } = await db
    .from('lesson_plans')
    .select(
      'id, class_id, course_id, term_id, offering_period_id, curriculum_release_id, status, courses(id, title, program_id, programs(name))',
    )
    .eq('class_id', cid);
  if (planError) throw planError;

  const plans = selectClassPlansForScope(planRows ?? [], {
    classId: cid,
    termId: klass?.term_id,
    offeringPeriodId: klass?.offering_period_id,
    currentCourseId: klass?.current_course_id,
  }).map((plan) => ({ ...plan, courses: asOne(plan.courses) }));
  if (plans.length === 0) return { ...empty, currentWeek };

  const { data: lessonRows, error: lessonError } = await db
    .from('lessons')
    .select(LESSON_SELECT)
    .in(
      'lesson_plan_id',
      plans.map((plan) => plan.id),
    );
  if (lessonError) throw lessonError;

  const visibleLessons = visibleLessonsOnClassPlans(
    (lessonRows ?? []).map((lesson: any) => ({
      ...lesson,
      courses: asOne(lesson.courses),
    })),
    plans,
    cid,
    { currentWeek },
  );
  if (visibleLessons.length === 0) {
    return { ...empty, currentWeek };
  }

  const lessonIds = visibleLessons.map((lesson) => lesson.id).filter(Boolean);
  const planIds = [...new Set(visibleLessons.map(lessonPlanIdOf).filter(Boolean))];
  const packageScope = [
    lessonIds.length ? `lesson_id.in.(${lessonIds.join(',')})` : '',
    planIds.length ? `lesson_plan_id.in.(${planIds.join(',')})` : '',
  ]
    .filter(Boolean)
    .join(',');
  const [slideResult, flashcardResult, assignmentResult] = await Promise.all([
    db
      .from('lesson_materials')
      .select(
        'id, lesson_id, lesson_plan_id, curriculum_week_number, session_number, is_public',
      )
      .or(packageScope)
      .eq('file_type', 'slide-deck')
      .eq('is_public', true),
    db
      .from('flashcard_decks')
      .select(
        'id, lesson_id, lesson_plan_id, curriculum_week_number, session_number, is_public',
      )
      .or(packageScope)
      .eq('is_public', true),
    db
      .from('assignments')
      .select(
        'id, lesson_id, lesson_plan_id, curriculum_week_number, session_number, assignment_type, metadata, is_active',
      )
      .or(packageScope)
      .eq('is_active', true),
  ]);
  const packageError =
    slideResult.error ?? flashcardResult.error ?? assignmentResult.error;
  if (packageError) throw packageError;

  const lessons = attachLearnerPackageAvailability(visibleLessons, {
    slides: slideResult.data ?? [],
    flashcards: flashcardResult.data ?? [],
    assignments: assignmentResult.data ?? [],
  });
  const week = thisWeekNumber(lessons, currentWeek);
  return {
    currentWeek,
    week,
    thisWeekLessons: lessonsOnWeek(lessons, week),
    lessons,
  };
}

export async function loadLessonsForClassPlans(
  db: LessonScopeDb,
  classId?: string | null,
): Promise<any[]> {
  return (await loadLearnerClassWeek(db, classId)).lessons;
}
