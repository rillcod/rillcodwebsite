import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveStudentProgramScope } from '@/lib/assignments/visibility';
import {
  assessmentVisibleToStudent,
  loadAssessmentStudentProfile,
  type AssessmentStudentScope,
} from '@/lib/academic/assessment-visibility';

export type CbtStudentScope = AssessmentStudentScope;

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
  return assessmentVisibleToStudent(exam, student, scope);
}

/** Load a student's portal profile fields needed for CBT visibility checks. */
export async function loadCbtStudentProfile(
  admin: SupabaseClient,
  userId: string,
): Promise<CbtStudentScope | null> {
  return loadAssessmentStudentProfile(admin, userId);
}
