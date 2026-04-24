export type LessonPlanAccessUser = {
  id: string;
  role: string;
  school_id: string | null;
};

export type LessonScope = {
  school_id: string | null;
  created_by: string | null;
};

export function canAccessLessonScope(
  user: LessonPlanAccessUser,
  lesson: LessonScope,
  teacherSchoolIds: string[] = [],
): boolean {
  if (user.role === 'admin') return true;

  if (user.role === 'school') {
    return !!user.school_id && !!lesson.school_id && lesson.school_id === user.school_id;
  }

  if (user.role === 'teacher') {
    // Always show plans created by this teacher, regardless of school scope.
    if (lesson.created_by && lesson.created_by === user.id) return true;
    // Show school-scoped plans for schools the teacher belongs to.
    if (lesson.school_id && teacherSchoolIds.includes(lesson.school_id)) return true;
    return false;
  }

  // Non-admins must never read unscoped records without a creator match.
  if (!lesson.school_id) return false;

  return false;
}

