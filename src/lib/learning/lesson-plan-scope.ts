type LessonScopeDb = {
  from: (table: string) => any;
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

export async function filterLessonsForClassPlans(
  db: LessonScopeDb,
  lessons: any[],
  classId?: string | null,
  termId?: string | null,
) {
  if (!classId || lessons.length === 0) return lessons;
  const courseIds = Array.from(new Set(lessons.map((lesson) => lesson.course_id).filter(Boolean)));
  if (courseIds.length === 0) return lessons;

  let planQuery = db
    .from('lesson_plans')
    .select('id, course_id, term_id')
    .eq('class_id', classId)
    .in('course_id', courseIds);

  if (termId) planQuery = planQuery.eq('term_id', termId);

  const { data: plans } = await planQuery;
  const allowedPlanIds = new Set((plans ?? []).map((plan: any) => plan.id).filter(Boolean));
  const plannedCourseIds = new Set((plans ?? []).map((plan: any) => plan.course_id).filter(Boolean));

  return lessons.filter((lesson) => {
    const planId = lessonPlanIdOf(lesson);
    if (planId) return allowedPlanIds.has(planId);
    return !plannedCourseIds.has(lesson.course_id);
  });
}
