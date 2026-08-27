const STAFF_ROLES = new Set(["admin", "teacher", "school"]);

/**
 * The slide proxy uses the service-role database client, so it must re-apply
 * the learner release gate explicitly instead of relying on table RLS.
 */
export function slideDeckMayStream(input: {
  role?: string | null;
  lessonStatus?: string | null;
  isPublic?: boolean | null;
}): boolean {
  if (STAFF_ROLES.has(String(input.role ?? ""))) return true;
  return input.lessonStatus === "active" && input.isPublic === true;
}

/** A class-bound lesson belongs only to learners in that exact class. */
export function learnerMatchesLessonClass(input: {
  role?: string | null;
  learnerClassId?: string | null;
  lessonClassId?: string | null;
}): boolean {
  if (STAFF_ROLES.has(String(input.role ?? ""))) return true;
  if (input.role !== "student" || !input.lessonClassId) return true;
  return Boolean(
    input.learnerClassId && input.learnerClassId === input.lessonClassId
  );
}
