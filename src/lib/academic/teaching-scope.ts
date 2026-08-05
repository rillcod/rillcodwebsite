export type TeachingWeekScopeInput = {
  classId?: string | null;
  lessonPlanId?: string | null;
  curriculumWeekNumber?: number | string | null;
  lessonId?: string | null;
};

export type TeachingWeekAssetScope = {
  class_id: string | null;
  lesson_plan_id: string | null;
  curriculum_week_number: number | null;
  lesson_id: string | null;
};

/**
 * The canonical identity shared by the class workspace and the rich lesson
 * workspace. Keep metadata only as a legacy read fallback; new writes use these
 * real columns so every surface sees the same asset.
 */
export function teachingWeekAssetScope(
  input: TeachingWeekScopeInput
): TeachingWeekAssetScope {
  const week = Number(input.curriculumWeekNumber);
  return {
    class_id: input.classId || null,
    lesson_plan_id: input.lessonPlanId || null,
    curriculum_week_number: Number.isInteger(week) && week > 0 ? week : null,
    lesson_id: input.lessonId || null,
  };
}

/**
 * Reconcile content generated before its lesson existed. This only mutates the
 * relationship columns on teaching content; submissions, scores, grading and
 * delivery evidence are never read or changed.
 */
export async function relinkTeachingWeekAssets(
  db: any,
  input: Required<
    Pick<
      TeachingWeekScopeInput,
      "lessonPlanId" | "curriculumWeekNumber" | "lessonId"
    >
  > & { session?: number | null }
): Promise<{ linked: number; errors: string[] }> {
  const scope = teachingWeekAssetScope(input);
  if (
    !scope.lesson_plan_id ||
    !scope.curriculum_week_number ||
    !scope.lesson_id
  ) {
    return { linked: 0, errors: [] };
  }

  const session =
    input.session != null && Number(input.session) > 0
      ? Math.floor(Number(input.session))
      : null;

  // Only attach orphans that belong to this class meeting. Without the session
  // filter, creating Week 1 Class 1 would steal Week 1 Class 2's homework.
  const tables = [
    "assignments",
    "flashcard_decks",
    "lesson_materials",
  ] as const;
  const results = await Promise.all(
    tables.map(async (table) => {
      let query = db
        .from(table)
        .update({ lesson_id: scope.lesson_id })
        .eq("lesson_plan_id", scope.lesson_plan_id)
        .eq("curriculum_week_number", scope.curriculum_week_number)
        .is("lesson_id", null);
      if (session != null) {
        // Prefer explicit session metadata; also allow untagged legacy orphans
        // only when this is session 1 (the historical single-meeting case).
        if (session === 1) {
          query = query.or(
            `metadata->>session.eq.${session},metadata->>session_number.eq.${session},metadata->>session.is.null,metadata.is.null`,
          );
        } else {
          query = query.or(
            `metadata->>session.eq.${session},metadata->>session_number.eq.${session}`,
          );
        }
      }
      return query.select("id");
    }),
  );

  const errors: string[] = [];
  let linked = 0;
  results.forEach((result, index) => {
    if (result.error) errors.push(`${tables[index]}: ${result.error.message}`);
    linked += Array.isArray(result.data) ? result.data.length : 0;
  });
  return { linked, errors };
}
