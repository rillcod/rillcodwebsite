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

export function lessonPlanIdOf(lesson: any): string | null {
  // Canonical column first — generators write lesson_plan_id directly.
  // Metadata remains a fallback for older rows that only stored the link there.
  const column = lesson?.lesson_plan_id;
  if (typeof column === 'string' && column.trim()) return column.trim();
  const metadata = lesson?.metadata;
  if (!metadata || typeof metadata !== 'object') return null;
  const id = metadata.lesson_plan_id;
  return typeof id === 'string' && id.trim() ? id : null;
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

/**
 * Live lessons on this class's teaching plan. Catalogue leftovers are dropped
 * when the class has a plan. Shared-release rows also pass canLearnerSeeSharedWeek
 * so another edition cannot leak in.
 */
export function visibleLessonsOnClassPlans(
  lessons: readonly any[],
  plans: readonly any[],
  classId: string,
): any[] {
  const cid = String(classId ?? '').trim();
  if (!cid || plans.length === 0) return [];

  const plansById = new Map(plans.map((plan) => [plan.id, plan]));
  const releasedByPlan = new Map(
    plans.map((plan) => [plan.id, weeksReleasedOnPlan(lessons, plan.id)]),
  );

  const visible = lessons.filter((lesson) => {
    if (lessonVisibility(lesson) !== 'live') return false;
    const planId = lessonPlanIdOf(lesson);
    if (!planId) return false;
    const plan = plansById.get(planId);
    if (!plan) return false;

    const lessonRelease = String(lesson.curriculum_release_id ?? '').trim();
    if (!lessonRelease) return true;

    const week = academicWeekNumber(lesson);
    if (week == null) return false;
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

  const { data: plans } = await db
    .from('lesson_plans')
    .select('id, class_id, course_id, term_id, offering_period_id, curriculum_release_id, status')
    .eq('class_id', cid);

  const scoped = selectClassPlansForScope(plans ?? [], {
    classId: cid,
    termId,
    offeringPeriodId: opts?.offeringPeriodId,
    currentCourseId: opts?.currentCourseId,
  });
  return visibleLessonsOnClassPlans(lessons, scoped, cid);
}

const LESSON_SELECT =
  'id, title, status, course_id, lesson_plan_id, curriculum_week_number, curriculum_release_id, session_number, order_index, metadata, courses(id, title, program_id, programs(name))';

/** This class, this term: the live weeks the teacher has shared, in week order. */
export async function loadLessonsForClassPlans(
  db: LessonScopeDb,
  classId?: string | null,
): Promise<any[]> {
  const cid = String(classId ?? '').trim();
  if (!cid) return [];

  const { data: klass } = await db
    .from('classes')
    .select('term_id, offering_period_id, current_course_id')
    .eq('id', cid)
    .maybeSingle();

  const { data: planRows } = await db
    .from('lesson_plans')
    .select(
      'id, class_id, course_id, term_id, offering_period_id, curriculum_release_id, status, courses(id, title, program_id, programs(name))',
    )
    .eq('class_id', cid);

  const plans = selectClassPlansForScope(planRows ?? [], {
    classId: cid,
    termId: klass?.term_id,
    offeringPeriodId: klass?.offering_period_id,
    currentCourseId: klass?.current_course_id,
  }).map((plan) => ({ ...plan, courses: asOne(plan.courses) }));
  if (plans.length === 0) return [];

  const { data: lessonRows } = await db
    .from('lessons')
    .select(LESSON_SELECT)
    .in(
      'lesson_plan_id',
      plans.map((plan) => plan.id),
    );

  const lessons = (lessonRows ?? []).map((lesson: any) => ({
    ...lesson,
    courses: asOne(lesson.courses),
  }));
  return visibleLessonsOnClassPlans(lessons, plans, cid);
}
