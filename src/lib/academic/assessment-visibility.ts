import type { SupabaseClient } from '@supabase/supabase-js';
import type { StudentProgramScope } from '@/lib/assignments/visibility';

export interface AssessmentStudentScope {
  id: string;
  school_id: string | null;
  school_name: string | null;
  class_id: string | null;
  section_class: string | null;
}

/**
 * One learner-visibility rule for result-bearing assessments. CBT and written
 * papers both call this function so list, detail and start gates cannot drift.
 */
export function assessmentVisibleToStudent(
  assessment: any,
  student: AssessmentStudentScope,
  scope: StudentProgramScope,
): boolean {
  const metadata = assessment.metadata && typeof assessment.metadata === 'object'
    ? assessment.metadata
    : {};
  const programId = typeof assessment.program_id === 'string' ? assessment.program_id : null;
  const courseId = typeof assessment.course_id === 'string' ? assessment.course_id : null;
  const targetClassId = typeof assessment.class_id === 'string' && assessment.class_id
    ? assessment.class_id
    : typeof metadata.target_class_id === 'string'
      ? metadata.target_class_id
      : null;
  const classScoped = metadata.visibility === 'class' || !!targetClassId;

  if (student.school_id) {
    if (assessment.school_id !== student.school_id) return false;
  } else if (assessment.school_id) {
    return false;
  }

  if (classScoped) {
    return !!targetClassId && !!student.class_id && student.class_id === targetClassId;
  }

  if (programId) return scope.programIds.has(programId);
  if (courseId) return scope.courseIds.has(courseId);
  return metadata.visibility === 'all';
}

export async function loadAssessmentStudentProfile(
  admin: SupabaseClient,
  userId: string,
): Promise<AssessmentStudentScope | null> {
  const { data, error } = await admin
    .from('portal_users')
    .select('id, school_id, school_name, class_id, section_class')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(`Could not load learner assessment scope: ${error.message}`);
  return (data as AssessmentStudentScope) ?? null;
}
