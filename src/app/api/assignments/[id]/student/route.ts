import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type StudentScope = {
  id: string;
  school_id: string | null;
  school_name: string | null;
  class_id: string | null;
  section_class: string | null;
  primary_teacher_id: string | null;
  enrollment_type: string | null;
};

async function enrolledCourseIds(admin: ReturnType<typeof adminClient>, studentId: string): Promise<Set<string>> {
  const { data: enrollments } = await admin
    .from('enrollments')
    .select('program_id')
    .eq('user_id', studentId);
  const programIds = (enrollments ?? []).map((e: any) => e.program_id).filter(Boolean);
  if (programIds.length === 0) return new Set();

  const { data: courses } = await admin
    .from('courses')
    .select('id')
    .in('program_id', programIds);
  return new Set((courses ?? []).map((c: any) => c.id).filter(Boolean));
}

async function getStudentClassTeacherId(admin: ReturnType<typeof adminClient>, classId: string | null): Promise<string | null> {
  if (!classId) return null;
  const { data } = await admin
    .from('classes')
    .select('teacher_id')
    .eq('id', classId)
    .maybeSingle();
  return data?.teacher_id ?? null;
}

function normalizeList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function assignmentVisibleToStudent(
  asgn: any,
  student: StudentScope,
  enrolledCourses: Set<string>,
  creatorRoles: Record<string, string>,
  classTeacherId: string | null
): boolean {
  const meta = asgn.metadata || {};
  const courseId = typeof asgn.course_id === 'string' ? asgn.course_id : null;
  const creatorId = asgn.created_by;
  const creatorRole = creatorId ? creatorRoles[creatorId] : null;

  // 1. School ID scope check: If the assignment is tied to a school, the student must belong to it.
  if (asgn.school_id) {
    if (!student.school_id || asgn.school_id !== student.school_id) return false;
  }
  // 2. School Name scope check (legacy / fallback): If school name is specified, student must match it.
  else if (asgn.school_name) {
    if (!student.school_name || asgn.school_name.toLowerCase() !== student.school_name.toLowerCase()) return false;
  }

  // 3. Course Enrollment check: A student must be enrolled in the course of the assignment.
  // This is critical, especially for summer/online school students who shouldn't see other courses' assignments.
  if (courseId) {
    if (enrolledCourses.size > 0 && !enrolledCourses.has(courseId)) return false;
    if (enrolledCourses.size === 0) return false;
  }

  // 4. Class / Student Scoping check:
  const targetClassId = meta.target_class_id || asgn.class_id;

  // If the assignment has explicit class scoping
  if (meta.visibility === 'class' || targetClassId || meta.target_class_name) {
    const classIdMatch = targetClassId && student.class_id && targetClassId === student.class_id;
    const classNameMatch = meta.target_class_name && student.section_class &&
      String(meta.target_class_name).toLowerCase().trim() === student.section_class.toLowerCase().trim();
    if (!classIdMatch && !classNameMatch) return false;
  }
  // If no explicit class scoping, but it is created by a teacher:
  else if (creatorRole === 'teacher') {
    // Teacher assignments without class scoping should be targeted smartly.
    // For summer/online school students (or all students), they should only see this assignment
    // if the teacher is their class tutor/teacher, or if they are explicitly targeted.
    const isTutor = classTeacherId && creatorId === classTeacherId;
    const isPrimaryTeacher = student.primary_teacher_id && creatorId === student.primary_teacher_id;
    if (!isTutor && !isPrimaryTeacher) return false;
  }

  // 5. Work mode checks (specific student/group targeting)
  if (meta.work_mode === 'specific') {
    if (!normalizeList(meta.target_student_ids).includes(student.id)) return false;
  } else if (meta.work_mode === 'group') {
    const groups = Array.isArray(meta.groups) ? meta.groups : [];
    if (!groups.some((g: any) => normalizeList(g?.studentIds).includes(student.id))) return false;
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assignments/[id]/student
// Returns the assignment + the calling user's own submission.
// Intended for students only. Correct answers are stripped from questions.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();

    // Fetch caller profile — class_id needed for class-scoped visibility check
    const { data: caller } = await admin
      .from('portal_users')
      .select('role, id, school_id, school_name, class_id, section_class')
      .eq('id', user.id)
      .single();

    if (!caller) return NextResponse.json({ error: 'User not found' }, { status: 403 });

    // This endpoint is for students only — staff use GET /api/assignments/[id]
    if (!['student', 'parent'].includes(caller.role)) {
      return NextResponse.json({ error: 'Use /api/assignments/[id] for staff access' }, { status: 403 });
    }

    const { id } = await context.params;
    const searchParams = _request.nextUrl.searchParams;
    const studentIdParam = searchParams.get('studentId');

    // Who are we fetching for?
    const targetStudentId = (caller.role === 'parent' && studentIdParam) ? studentIdParam : user.id;

    // If parent is asking for a student, verify link
    if (caller.role === 'parent' && studentIdParam) {
      const { data: link } = await admin
        .from('parent_student_links')
        .select('id')
        .eq('parent_id', user.id)
        .eq('student_id', studentIdParam)
        .maybeSingle();

      if (!link) return NextResponse.json({ error: 'Student not linked to this parent' }, { status: 403 });
    }

    const { data: targetStudent } = await admin
      .from('portal_users')
      .select('id, school_id, school_name, class_id, section_class, primary_teacher_id, enrollment_type')
      .eq('id', targetStudentId)
      .single();

    if (!targetStudent) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    const [asgnRes, subRes] = await Promise.all([
      admin
        .from('assignments')
        .select('id, title, description, instructions, due_date, max_points, assignment_type, is_active, created_at, created_by, questions, course_id, class_id, school_id, school_name, metadata, courses ( id, title, programs ( name ) )')
        .eq('id', id)
        .maybeSingle(),
      admin
        .from('assignment_submissions')
        .select('id, status, grade, feedback, submitted_at, graded_at, portal_user_id, submission_text, file_url, answers')
        .eq('assignment_id', id)
        .eq('portal_user_id', targetStudentId)
        .maybeSingle(),
    ]);

    if (asgnRes.error) return NextResponse.json({ error: asgnRes.error.message }, { status: 500 });
    if (!asgnRes.data) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

    const asgn = asgnRes.data as any;

    // Students can only see active assignments from their school
    if (!asgn.is_active) {
      return NextResponse.json({ error: 'This assignment is not currently active' }, { status: 403 });
    }
    const courseIds = await enrolledCourseIds(admin, targetStudentId);
    const classTeacherId = await getStudentClassTeacherId(admin, targetStudent.class_id);

    let creatorRoles: Record<string, string> = {};
    if (asgn.created_by) {
      const { data: creatorUser } = await admin
        .from('portal_users')
        .select('role')
        .eq('id', asgn.created_by)
        .maybeSingle();
      if (creatorUser?.role) {
        creatorRoles[asgn.created_by] = creatorUser.role;
      }
    }

    if (!assignmentVisibleToStudent(asgn, targetStudent as StudentScope, courseIds, creatorRoles, classTeacherId)) {
      return NextResponse.json({ error: 'You do not have access to this assignment' }, { status: 403 });
    }

    // Strip correct_answer from questions so students can't cheat
    const safeQuestions = Array.isArray(asgn.questions)
      ? asgn.questions.map(({ correct_answer: _ca, ...q }: any) => q)
      : asgn.questions;

    const data = {
      ...asgn,
      questions: safeQuestions,
      assignment_submissions: subRes.data ? [subRes.data] : [],
    };

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
