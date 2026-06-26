import type { SupabaseClient } from '@supabase/supabase-js';

export interface CbtStudentScope {
  id: string;
  school_id: string | null;
  school_name: string | null;
  class_id: string | null;
  section_class: string | null;
}

export interface StudentCbtProgramScope {
  programIds: Set<string>;
  courseIds: Set<string>;
}

/**
 * Programmes a student may access CBT for — formal enrollments plus the
 * programme tied to their class (many school students only have class placement).
 */
export async function resolveStudentCbtScope(
  admin: SupabaseClient,
  studentId: string,
  classId: string | null,
): Promise<StudentCbtProgramScope> {
  const { data: enrollments } = await admin
    .from('enrollments')
    .select('program_id')
    .eq('user_id', studentId)
    .in('status', ['active', 'enrolled', 'approved']);

  const programIds = new Set(
    (enrollments ?? []).map((e: any) => e.program_id).filter(Boolean) as string[],
  );

  if (classId) {
    const { data: cls } = await admin
      .from('classes')
      .select('program_id')
      .eq('id', classId)
      .maybeSingle();
    if (cls?.program_id) programIds.add(cls.program_id);
  }

  if (programIds.size === 0) return { programIds, courseIds: new Set() };

  const { data: courses } = await admin
    .from('courses')
    .select('id')
    .in('program_id', Array.from(programIds));

  return {
    programIds,
    courseIds: new Set((courses ?? []).map((c: any) => c.id).filter(Boolean) as string[]),
  };
}

/** Whether an active CBT exam should appear for this student. */
export function cbtExamVisibleToStudent(
  exam: any,
  student: CbtStudentScope,
  scope: StudentCbtProgramScope,
): boolean {
  const meta = exam.metadata || {};
  const programId = typeof exam.program_id === 'string' ? exam.program_id : null;
  const courseId = typeof exam.course_id === 'string' ? exam.course_id : null;
  const targetClassId = meta.target_class_id as string | undefined;
  const classScoped = meta.visibility === 'class' || !!targetClassId;

  // School boundary — school-tagged exams stay within that school.
  if (exam.school_id) {
    if (!student.school_id || exam.school_id !== student.school_id) return false;
  }

  // Class-targeted exam — only members of that class.
  if (classScoped) {
    if (!targetClassId || !student.class_id || student.class_id !== targetClassId) return false;
    return true;
  }

  // Programme gate (authoritative cohort scope).
  if (programId) {
    if (scope.programIds.size === 0 || !scope.programIds.has(programId)) return false;
  } else if (courseId) {
    if (scope.courseIds.size === 0 || !scope.courseIds.has(courseId)) return false;
  } else if (meta.visibility !== 'all') {
    // Unscoped exam — hidden unless explicitly platform-wide.
    return false;
  }

  return true;
}

/** Load a student's portal profile fields needed for CBT visibility checks. */
export async function loadCbtStudentProfile(
  admin: SupabaseClient,
  userId: string,
): Promise<CbtStudentScope | null> {
  const { data } = await admin
    .from('portal_users')
    .select('id, school_id, school_name, class_id, section_class')
    .eq('id', userId)
    .maybeSingle();
  return (data as CbtStudentScope) ?? null;
}
