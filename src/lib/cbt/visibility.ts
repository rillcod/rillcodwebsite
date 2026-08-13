import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveStudentProgramScope } from '@/lib/assignments/visibility';

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
  return resolveStudentProgramScope(admin, studentId, classId);
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

  // School boundary — school students only see exams explicitly tied to their school.
  if (student.school_id) {
    if (exam.school_id !== student.school_id) return false;
  } else if (exam.school_id) {
    return false;
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
