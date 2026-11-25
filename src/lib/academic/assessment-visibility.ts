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

  // Teacher-only offline hall paper mark sheets are never online CBT sittings.
  if (metadata.paper_only === true) return false;

  const programId = typeof assessment.program_id === 'string' ? assessment.program_id : null;
  const courseId = typeof assessment.course_id === 'string' ? assessment.course_id : null;
  const targetClassId = typeof assessment.class_id === 'string' && assessment.class_id
    ? assessment.class_id
    : typeof metadata.target_class_id === 'string' && metadata.target_class_id
      ? metadata.target_class_id
      : typeof metadata.class_id === 'string' && metadata.class_id
        ? metadata.class_id
        : null;
  const targetClassName = typeof metadata.target_class_name === 'string' && metadata.target_class_name.trim()
    ? metadata.target_class_name.trim().toLowerCase()
    : null;
  const classScoped = metadata.visibility === 'class' || !!targetClassId || !!targetClassName;

  if (student.school_id) {
    if (assessment.school_id !== student.school_id) return false;
  } else if (assessment.school_id) {
    return false;
  }

  if (classScoped) {
    if (targetClassId) {
      return !!student.class_id && student.class_id === targetClassId;
    }
    if (targetClassName) {
      return !!student.section_class && student.section_class.trim().toLowerCase() === targetClassName;
    }
    return false;
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
  if (!data) return null;

  const profile = data as AssessmentStudentScope;
  if (!profile.class_id) {
    const { data: activeRoster } = await (admin as any)
      .from('class_term_rosters')
      .select('class_id, school_id, classes:class_id(name)')
      .eq('student_id', userId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeRoster?.class_id) {
      const clsName = Array.isArray(activeRoster.classes)
        ? activeRoster.classes[0]?.name
        : activeRoster.classes?.name;
      return {
        ...profile,
        class_id: activeRoster.class_id,
        school_id: profile.school_id ?? activeRoster.school_id ?? null,
        section_class: profile.section_class ?? clsName ?? null,
      };
    }
  }
  return profile;
}
