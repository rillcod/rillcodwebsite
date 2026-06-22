import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Assignment visibility — the SINGLE source of truth for "which assignments a
 * student is allowed to see". Both the list route (`/api/assignments`) and the
 * single-assignment student route (`/api/assignments/[id]/student`) import this
 * so the rules can never drift apart.
 *
 * Scope precedence on an assignment row:
 *   program_id (cohort / track)  →  course_id (course within the programme)
 *   →  school_id / school_name   →  class / section  →  specific-student / group.
 *
 * The PROGRAMME gate is authoritative: a programme-tagged assignment only reaches
 * students enrolled in that programme. An assignment with NEITHER a programme nor
 * a course is "unscoped" and is hidden from learners unless it is explicitly
 * marked platform-wide (`metadata.visibility === 'all'`) — this is what stops
 * untagged assignments leaking across every programme.
 */

export interface AssignmentStudentScope {
  id: string;
  school_id: string | null;
  school_name: string | null;
  class_id: string | null;
  section_class: string | null;
  primary_teacher_id: string | null;
  enrollment_type: string | null;
}

/** The programmes a student is enrolled in, plus the courses that live under them. */
export interface StudentProgramScope {
  programIds: Set<string>;
  courseIds: Set<string>;
}

/**
 * Resolve, in one place, the programmes a student is enrolled in and the courses
 * that belong to those programmes. Used to evaluate the programme/course gate.
 */
export async function resolveStudentProgramScope(
  admin: SupabaseClient,
  studentId: string,
): Promise<StudentProgramScope> {
  const { data: enrollments } = await admin
    .from('enrollments')
    .select('program_id')
    .eq('user_id', studentId);

  const programIds = new Set(
    (enrollments ?? []).map((e: any) => e.program_id).filter(Boolean) as string[],
  );
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

function normalizeList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function assignmentVisibleToStudent(
  asgn: any,
  student: AssignmentStudentScope,
  scope: StudentProgramScope,
  creatorRoles: Record<string, string>,
  classTeacherId: string | null,
): boolean {
  const meta = asgn.metadata || {};
  const courseId = typeof asgn.course_id === 'string' ? asgn.course_id : null;
  const programId = typeof asgn.program_id === 'string' ? asgn.program_id : null;
  const creatorId = asgn.created_by;
  const creatorRole = creatorId ? creatorRoles[creatorId] : null;

  // 1. School scope — if the assignment is tied to a school, the student must belong to it.
  if (asgn.school_id) {
    if (!student.school_id || asgn.school_id !== student.school_id) return false;
  } else if (asgn.school_name) {
    if (!student.school_name || asgn.school_name.toLowerCase() !== student.school_name.toLowerCase()) return false;
  }

  // 2. PROGRAMME gate (authoritative cohort scope).
  //    - Explicit program_id  → student must be enrolled in that programme.
  //    - Legacy: only a course → fall back to course-in-my-programmes membership.
  //    - Neither               → unscoped; hidden from learners unless platform-wide.
  if (programId) {
    if (scope.programIds.size === 0 || !scope.programIds.has(programId)) return false;
  } else if (courseId) {
    if (scope.courseIds.size === 0 || !scope.courseIds.has(courseId)) return false;
  } else if (meta.visibility !== 'all') {
    return false;
  }

  // 3. Class / section scoping.
  const targetClassId = meta.target_class_id || asgn.class_id;
  if (meta.visibility === 'class' || targetClassId || meta.target_class_name) {
    const classIdMatch = targetClassId && student.class_id && targetClassId === student.class_id;
    const classNameMatch = meta.target_class_name && student.section_class &&
      String(meta.target_class_name).toLowerCase().trim() === student.section_class.toLowerCase().trim();
    if (!classIdMatch && !classNameMatch) return false;
  }
  // No explicit class scoping, but created by a teacher → only that teacher's own
  // students (their class tutees or those who name them as primary teacher) see it.
  else if (creatorRole === 'teacher') {
    const isTutor = classTeacherId && creatorId === classTeacherId;
    const isPrimaryTeacher = student.primary_teacher_id && creatorId === student.primary_teacher_id;
    if (!isTutor && !isPrimaryTeacher) return false;
  }

  // 4. Work-mode targeting (specific student / group).
  if (meta.work_mode === 'specific') {
    if (!normalizeList(meta.target_student_ids).includes(student.id)) return false;
  } else if (meta.work_mode === 'group') {
    const groups = Array.isArray(meta.groups) ? meta.groups : [];
    if (!groups.some((g: any) => normalizeList(g?.studentIds).includes(student.id))) return false;
  }

  return true;
}

/**
 * Resolve the programme a course belongs to. Used on create/update to auto-tag an
 * assignment's `program_id` from its `course_id` when the client didn't send one.
 */
export async function programIdForCourse(
  admin: SupabaseClient,
  courseId: string | null | undefined,
): Promise<string | null> {
  if (!courseId) return null;
  const { data } = await admin
    .from('courses')
    .select('program_id')
    .eq('id', courseId)
    .maybeSingle();
  return (data as any)?.program_id ?? null;
}
