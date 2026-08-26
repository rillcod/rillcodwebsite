// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function requireStaffUser(supabase: any): Promise<{ id: string; role: string; school_id: string | null } | null> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from('portal_users')
    .select('role, school_id')
    .eq('id', user.id)
    .single();
  if (!['admin', 'teacher'].includes(profile?.role || '')) return null;
  return { id: user.id as string, role: profile.role as string, school_id: profile.school_id ?? null };
}

export type LessonPlanAccessUser = {
  id: string;
  role: string;
  school_id: string | null;
};

export type LessonScope = {
  school_id: string | null;
  created_by: string | null;
  /** A class-bound plan follows the current class assignment, not its author. */
  class_id?: string | null;
  class_teacher_id?: string | null;
};

export function canAccessLessonScope(
  user: LessonPlanAccessUser,
  lesson: LessonScope,
  _teacherSchoolIds: string[] = [],
): boolean {
  if (user.role === 'admin') return true;

  if (user.role === 'school') {
    return !!user.school_id && !!lesson.school_id && lesson.school_id === user.school_id;
  }

  if (user.role === 'teacher') {
    // Reassignment must revoke the former teacher immediately. A creator match
    // is only authoritative for a genuinely standalone plan; once attached to
    // a class, classes.teacher_id is the single teaching authority.
    if (lesson.class_id) {
      return Boolean(
        lesson.class_teacher_id && lesson.class_teacher_id === user.id,
      );
    }
    return Boolean(lesson.created_by && lesson.created_by === user.id);
  }

  // Non-admins must never read unscoped records without a creator match.
  if (!lesson.school_id) return false;

  return false;
}

