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

  // Non-admins must never read unscoped records.
  if (!lesson.school_id) return false;

  if (user.role === 'school') {
    return !!user.school_id && lesson.school_id === user.school_id;
  }

  if (user.role === 'teacher') {
    if (lesson.created_by && lesson.created_by === user.id) return true;
    return teacherSchoolIds.includes(lesson.school_id);
  }

  return false;
}

