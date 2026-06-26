import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  assignmentVisibleToStudent,
  resolveStudentProgramScope,
  programIdForCourse,
} from '@/lib/assignments/visibility';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Caller = {
  role: string; id: string;
  school_id: string | null; school_name: string | null;
  class_id: string | null; section_class: string | null;
  primary_teacher_id: string | null;
  enrollment_type: string | null;
};

async function requireAuth(): Promise<Caller | null> {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id, school_id, school_name, class_id, section_class, primary_teacher_id, enrollment_type')
    .eq('id', user.id)
    .single();
  return (caller as Caller) ?? null;
}

/** All school IDs a teacher is assigned to. */
async function teacherSchoolIds(callerId: string, primarySchoolId: string | null): Promise<string[]> {
  const ids: string[] = [];
  if (primarySchoolId) ids.push(primarySchoolId);
  const { data: ts } = await adminClient()
    .from('teacher_schools')
    .select('school_id')
    .eq('teacher_id', callerId);
  (ts ?? []).forEach((r: any) => {
    if (r.school_id && !ids.includes(r.school_id)) ids.push(r.school_id);
  });
  return ids;
}

async function getStudentClassTeacherId(classId: string | null): Promise<string | null> {
  if (!classId) return null;
  const { data } = await adminClient()
    .from('classes')
    .select('teacher_id')
    .eq('id', classId)
    .maybeSingle();
  return data?.teacher_id ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assignments — list assignments visible to current user
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const caller = await requireAuth();
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const lessonPlanIdFilter = url.searchParams.get('lesson_plan_id');

    const admin = adminClient();
    let query = admin
      .from('assignments')
      .select(`
        id, title, description, instructions, due_date, max_points,
        assignment_type, is_active, created_at, created_by,
        course_id, program_id, class_id, school_id, school_name, metadata,
        courses ( id, title, programs ( name ) ),
        assignment_submissions ( id, status, grade, feedback, submitted_at, graded_at, file_url, portal_user_id )
      `)
      .order('due_date', { ascending: true });

    if (lessonPlanIdFilter) {
      query = query.filter('metadata->>lesson_plan_id', 'eq', lessonPlanIdFilter) as any;
    }

    if (caller.role === 'admin') {
      // No filter — see all
    } else if (caller.role === 'teacher') {
      // Fetch own assignments + any assignment at their schools (school-wide platform work).
      // Class-targeted assignments from other teachers are excluded in post-filter below.
      const schoolIds = await teacherSchoolIds(caller.id, caller.school_id);
      if (schoolIds.length > 0) {
        const orParts = [`created_by.eq.${caller.id}`, ...schoolIds.map(sid => `school_id.eq.${sid}`)];
        query = query.or(orParts.join(',')) as any;
      } else {
        query = query.eq('created_by', caller.id) as any;
      }
    } else if (caller.role === 'school') {
      // School role: only their own school's assignments
      const orParts: string[] = [];
      if (caller.school_id) orParts.push(`school_id.eq.${caller.school_id}`);
      if (caller.school_name) orParts.push(`school_name.eq.${caller.school_name}`);
      if (orParts.length > 0) query = query.or(orParts.join(',')) as any;
    } else if (caller.role === 'student') {
      // All active assignments in the student's broad scope; precise visibility filtering done below.
      query = query.eq('is_active', true) as any;
      if (caller.school_id || caller.school_name) {
        const scopeParts = ['school_id.is.null'];
        if (caller.school_id) scopeParts.push(`school_id.eq.${caller.school_id}`);
        if (caller.school_name) scopeParts.push(`school_name.eq.${JSON.stringify(caller.school_name)}`);
        query = query.or(scopeParts.join(',')) as any;
      } else {
        // Online / B2C student - only see platform-wide/global assignments (school_id is null)
        query = query.is('school_id', null) as any;
      }
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    let rows = data ?? [];

    // Teacher post-filter: the DB query fetched own + school assignments.
    // Strip out class-targeted assignments that belong to other teachers —
    // those are private to their creator (only visible via direct assignment view).
    if (caller.role === 'teacher') {
      const classIds = Array.from(new Set(rows
        .map((a: any) => (a.metadata || {}).target_class_id || a.class_id)
        .filter(Boolean) as string[]));
      let classOwners: Record<string, string> = {};
      if (classIds.length > 0) {
        const { data: classes } = await admin
          .from('classes')
          .select('id, teacher_id')
          .in('id', classIds);
        (classes ?? []).forEach((cls: any) => { if (cls.id) classOwners[cls.id] = cls.teacher_id; });
      }
      rows = rows.filter((a: any) => {
        if (a.created_by === caller.id) return true;
        const targetClassId = (a.metadata || {}).target_class_id || a.class_id;
        if (targetClassId) return classOwners[targetClassId] === caller.id;
        // Platform / admin school-wide assignment: visible if NOT class-scoped
        const vis = (a.metadata || {}).visibility;
        return vis !== 'class';
      });
    }

    // Student: apply visibility + work-mode targeting from metadata
    if (caller.role === 'student') {
      const scope = await resolveStudentProgramScope(admin, caller.id, caller.class_id);
      const classTeacherId = await getStudentClassTeacherId(caller.class_id);

      // Fetch class course focus if student is assigned to a class
      let currentCourseId: string | null = null;
      if (caller.class_id) {
        const { data: clsData } = await admin
          .from('classes')
          .select('current_course_id')
          .eq('id', caller.class_id)
          .maybeSingle();
        currentCourseId = clsData?.current_course_id ?? null;
      }

      // Fetch roles of all creators of these assignments to distinguish admin-assigned vs teacher-assigned.
      const creatorIds = Array.from(new Set(rows.map((r: any) => r.created_by).filter(Boolean)));
      let creatorRoles: Record<string, string> = {};
      if (creatorIds.length > 0) {
        const { data: users } = await admin
          .from('portal_users')
          .select('id, role')
          .in('id', creatorIds);
        (users ?? []).forEach((u: any) => {
          creatorRoles[u.id] = u.role;
        });
      }

      if (currentCourseId) {
        rows = rows.filter((a: any) => a.course_id === currentCourseId);
      }

      rows = rows
        .filter((a: any) => assignmentVisibleToStudent(a, caller, scope, creatorRoles, classTeacherId))
        .map((a: any) => ({
          ...a,
          assignment_submissions: (a.assignment_submissions ?? []).filter((s: any) => s.portal_user_id === caller.id),
        }));
    }

    return NextResponse.json({ data: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/assignments — create a new assignment
// Teacher: school is locked to their own assigned schools only
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const caller = await requireAuth();
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['admin', 'teacher'].includes(caller.role)) {
      return NextResponse.json({ error: 'Not authorized to create assignments' }, { status: 403 });
    }

    const body = await request.json();

    if (!body.title) return NextResponse.json({ error: 'title is required' }, { status: 400 });

    const admin = adminClient();

    // Resolve school — teacher cannot set an arbitrary school_id
    let resolvedSchoolId: string | null = null;
    let resolvedSchoolName: string | null = null;

    if (caller.role === 'admin') {
      resolvedSchoolId = body.school_id ?? null;
      resolvedSchoolName = body.school_name ?? null;
    } else {
      // Teacher: validate school_id against their assignments
      const requestedSchoolId: string | null = typeof body.school_id === 'string' ? body.school_id : null;
      if (requestedSchoolId) {
        const scopedIds = await teacherSchoolIds(caller.id, caller.school_id);
        if (!scopedIds.includes(requestedSchoolId)) {
          return NextResponse.json(
            { error: 'You are not assigned to the school you selected for this assignment.' },
            { status: 403 },
          );
        }
        resolvedSchoolId = requestedSchoolId;
      } else {
        if (!caller.school_id) {
          return NextResponse.json(
            { error: 'Select one of your assigned schools for this assignment.' },
            { status: 400 },
          );
        }
        resolvedSchoolId = caller.school_id;
      }
      resolvedSchoolName = body.school_name ?? caller.school_name ?? null;
    }

    // Validate that a class-scoped assignment targets a class this teacher owns.
    // Without this, Suleiman could create an assignment targeting Amaka's class_id.
    const targetClassId = body.metadata?.target_class_id || body.class_id;
    if (caller.role === 'teacher' && targetClassId) {
      const { data: targetCls } = await admin
        .from('classes')
        .select('teacher_id, school_id')
        .eq('id', targetClassId)
        .maybeSingle();
      if (!targetCls) {
        return NextResponse.json({ error: 'Target class not found' }, { status: 400 });
      }
      if (targetCls.teacher_id !== caller.id) {
        return NextResponse.json(
          { error: 'You can only target classes you own' },
          { status: 403 },
        );
      }
      if (resolvedSchoolId && targetCls.school_id && targetCls.school_id !== resolvedSchoolId) {
        return NextResponse.json(
          { error: 'Target class belongs to a different school' },
          { status: 403 },
        );
      }
    }

    const allowedFields = [
      'title', 'description', 'instructions', 'course_id', 'program_id', 'lesson_id',
      'due_date', 'max_points', 'assignment_type', 'is_active', 'questions', 'metadata',
      'class_id', 'weight', 'grading_mode',
    ];
    const payload: Record<string, unknown> = {
      created_by: caller.id,
      school_id: resolvedSchoolId,
      school_name: resolvedSchoolName,
      created_at: new Date().toISOString(),
    };
    for (const f of allowedFields) {
      if (f in body) payload[f] = body[f] ?? null;
    }
    if (!payload.grading_mode && Array.isArray(payload.questions) && payload.questions.length > 0) {
      const autoTypes = new Set(['multiple_choice', 'true_false', 'coding_blocks']);
      const autoGradeable = payload.questions.every((q: any) => (
        autoTypes.has(String(q.question_type ?? '').toLowerCase())
        && String(q.correct_answer ?? '').trim()
      ));
      if (autoGradeable) payload.grading_mode = 'auto';
    }

    // Programme is the authoritative cohort scope. If the client didn't send one,
    // derive it from the course so the assignment is never left untagged.
    if (!payload.program_id && payload.course_id) {
      payload.program_id = await programIdForCourse(admin, payload.course_id as string);
    } else if (!payload.program_id && payload.class_id) {
      const { data: cls } = await admin
        .from('classes')
        .select('program_id')
        .eq('id', payload.class_id as string)
        .maybeSingle();
      if (cls?.program_id) payload.program_id = cls.program_id;
    }

    const { data, error } = await admin
      .from('assignments')
      .insert(payload)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (data.is_active) {
      const { triggerAssignmentReleaseNotifications } = await import('@/lib/assignments/notifications');
      triggerAssignmentReleaseNotifications(data.id, caller.id).catch(console.error);
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
