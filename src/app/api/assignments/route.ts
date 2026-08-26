import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  assignmentVisibleToStudent,
  resolveStudentProgramScope,
  programIdForCourse,
} from '@/lib/assignments/visibility';
import { logAudit } from '@/lib/audit/log';
import { isAutoGradableAssignmentQuestion } from '@/lib/assignments/grading';

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

const ALLOWED_GRADING_MODES = new Set(['manual', 'auto', 'ai_suggested']);

function validateAssignmentInput(body: Record<string, any>, partial = false): { error: string; field: string } | null {
  if ((!partial || 'title' in body) && typeof body.title !== 'string') {
    return { error: 'title is required', field: 'title' };
  }
  if ('title' in body) {
    body.title = String(body.title).trim();
    if (!body.title) return { error: 'title is required', field: 'title' };
  }
  if ('max_points' in body && body.max_points != null) {
    const maxPoints = Number(body.max_points);
    if (!Number.isFinite(maxPoints) || maxPoints <= 0) {
      return { error: 'max_points must be a positive number', field: 'max_points' };
    }
    body.max_points = maxPoints;
  }
  if ('weight' in body && body.weight != null) {
    const weight = Number(body.weight);
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
      return { error: 'weight must be between 0 and 100', field: 'weight' };
    }
    body.weight = weight;
  }
  if ('due_date' in body && body.due_date) {
    const dueDate = new Date(body.due_date);
    if (Number.isNaN(dueDate.getTime())) {
      return { error: 'due_date must be a valid date', field: 'due_date' };
    }
    body.due_date = dueDate.toISOString();
  }
  if ('grading_mode' in body && body.grading_mode && !ALLOWED_GRADING_MODES.has(String(body.grading_mode))) {
    return { error: 'grading_mode must be manual, auto, or ai_suggested', field: 'grading_mode' };
  }
  return null;
}

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
    const termIdFilter = url.searchParams.get('term_id');
    const allSessions = url.searchParams.get('all_sessions') === '1';
    const summaryView = url.searchParams.get('view') === 'summary';

    const admin = adminClient();

    // Each branch is a separate function call so TypeScript resolves the select
    // return type independently — avoids TS2589 (instantiation too deep) that
    // occurs when a ternary forces the compiler to unify two large generic shapes.
    function buildSummaryQuery() {
      return admin.from('assignments').select(`
        id, title, due_date, max_points, assignment_type, is_active, created_at, created_by,
        course_id, program_id, class_id, school_id, school_name, metadata, term_id, lesson_plan_id,
        courses ( id, title, programs ( name ) ),
        assignment_submissions ( id, status, grade, feedback, submitted_at, graded_at, file_url, portal_user_id )
      `).order('due_date', { ascending: true });
    }
    function buildFullQuery() {
      return admin.from('assignments').select(`
        id, title, description, instructions, due_date, max_points,
        assignment_type, is_active, created_at, created_by,
        course_id, program_id, class_id, school_id, school_name, metadata, term_id,
        lesson_plan_id, curriculum_release_id, curriculum_year_number, curriculum_term_number, curriculum_week_number, session_number, learning_outcomes,
        courses ( id, title, programs ( name ) ),
        assignment_submissions ( id, status, grade, feedback, submitted_at, graded_at, file_url, portal_user_id )
      `).order('due_date', { ascending: true });
    }

    type AssignmentQuery = ReturnType<typeof buildSummaryQuery> | ReturnType<typeof buildFullQuery>;
    let query: AssignmentQuery = summaryView ? buildSummaryQuery() : buildFullQuery();

    if (lessonPlanIdFilter) {

      // Prefer the canonical FK while retaining metadata-only historical work.
      query = query.or(`lesson_plan_id.eq.${lessonPlanIdFilter},metadata->>lesson_plan_id.eq.${lessonPlanIdFilter}`) as any;
    }

    // Default: live academic session. Pass all_sessions=1 only for intentional history views.
    if (!allSessions) {
      const { resolveAssignmentTermId } = await import('@/lib/assignments/session');
      const termId = termIdFilter || await resolveAssignmentTermId(admin, {});
      if (termId) {
        // Include legacy untagged rows only for the live session so nothing vanishes overnight.
        const liveId = await resolveAssignmentTermId(admin, {});
        if (termId === liveId) {
          query = query.or(`term_id.eq.${termId},term_id.is.null`) as any;
        } else {
          query = query.eq('term_id', termId) as any;
        }
      }
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
      else return NextResponse.json({ error: 'School account is missing school scope' }, { status: 403 });
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

    // Teacher post-filter: teachers see their own assignments plus admin/school
    // assignments explicitly targeted to a class they own. Broad school-wide work
    // stays with admin/school accounts so teachers are not flooded with work they
    // did not create.
    if (caller.role === 'teacher') {
      const classIds = Array.from(new Set(rows
        .map((a: any) => (a.metadata || {}).target_class_id || a.class_id)
        .filter(Boolean) as string[]));
      const classOwners: Record<string, string> = {};
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
        return false;
      });
    }

    // Student: apply visibility + work-mode targeting from metadata
    if (caller.role === 'student') {
      const scope = await resolveStudentProgramScope(admin, caller.id, caller.class_id);
      const classTeacherId = await getStudentClassTeacherId(caller.class_id);

      // Fetch roles of all creators of these assignments to distinguish admin-assigned vs teacher-assigned.
      const creatorIds = Array.from(new Set(rows.map((r: any) => r.created_by).filter(Boolean)));
      const creatorRoles: Record<string, string> = {};
      if (creatorIds.length > 0) {
        const { data: users } = await admin
          .from('portal_users')
          .select('id, role')
          .in('id', creatorIds);
        (users ?? []).forEach((u: any) => {
          creatorRoles[u.id] = u.role;
        });
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
    const inputIssue = validateAssignmentInput(body);
    if (inputIssue) return NextResponse.json(inputIssue, { status: 400 });

    const admin = adminClient();
    const requestedMetadata = body.metadata && typeof body.metadata === 'object'
      && !Array.isArray(body.metadata)
      ? body.metadata as Record<string, unknown>
      : {};
    const lessonPlanId = typeof body.lesson_plan_id === 'string'
      ? body.lesson_plan_id
      : typeof body.metadata?.lesson_plan_id === 'string'
        ? body.metadata.lesson_plan_id
        : null;
    const targetClassId = body.metadata?.target_class_id || body.class_id;
    const assessmentScope = requestedMetadata.assessment_scope === 'practice'
      || requestedMetadata.result_eligible === false
      ? 'practice'
      : targetClassId || lessonPlanId
        ? 'class_result'
        : requestedMetadata.assessment_scope === 'class_result'
          ? 'class_result'
          : 'practice';

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
      } else if (targetClassId) {
        const { data: targetClassSchool } = await admin
          .from('classes')
          .select('teacher_id,school_id')
          .eq('id', targetClassId)
          .maybeSingle();
        if (!targetClassSchool || targetClassSchool.teacher_id !== caller.id) {
          return NextResponse.json({ error: 'You can only target classes you own' }, { status: 403 });
        }
        resolvedSchoolId = targetClassSchool.school_id;
      } else if (lessonPlanId) {
        const { data: targetPlan } = await admin
          .from('lesson_plans')
          .select('class_id,school_id')
          .eq('id', lessonPlanId)
          .maybeSingle();
        const { data: planClass } = targetPlan?.class_id
          ? await admin.from('classes').select('teacher_id').eq('id', targetPlan.class_id).maybeSingle()
          : { data: null };
        if (!targetPlan || planClass?.teacher_id !== caller.id) {
          return NextResponse.json({ error: 'You can only use lesson plans for classes you own' }, { status: 403 });
        }
        resolvedSchoolId = targetPlan.school_id;
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
    if (targetClassId) {
      const { data: targetCls } = await admin
        .from('classes')
        .select('id,teacher_id,school_id,program_id,term_id,academic_offering_id,offering_period_id')
        .eq('id', targetClassId)
        .maybeSingle();
      if (!targetCls) {
        return NextResponse.json({ error: 'Target class not found' }, { status: 400 });
      }
      if (caller.role === 'teacher' && targetCls.teacher_id !== caller.id) {
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
      if (assessmentScope === 'class_result'
        && (!targetCls.academic_offering_id || !targetCls.offering_period_id)) {
        return NextResponse.json({
          error: 'This class is not connected to an academic offering and period yet. Repair the class academic setup before publishing result-bearing work.',
          code: 'CLASS_ACADEMIC_CONTEXT_INCOMPLETE',
        }, { status: 409 });
      }
      body.class_id = targetCls.id;
      body.school_id = targetCls.school_id;
      body.program_id = targetCls.program_id ?? body.program_id;
      body.term_id = targetCls.term_id ?? body.term_id;
      body.academic_offering_id = targetCls.academic_offering_id;
      body.offering_period_id = targetCls.offering_period_id;
      resolvedSchoolId = targetCls.school_id;
    }

    // A class-plan assignment/project inherits its complete scope from that canonical plan.
    if (lessonPlanId) {
      const { data: plan } = await admin.from('lesson_plans')
        .select('id,class_id,course_id,term_id,school_id,status,curriculum_release_id,academic_offering_id,offering_period_id')
        .eq('id', lessonPlanId).maybeSingle();
      if (!plan || plan.status === 'archived' || !plan.class_id || !plan.course_id
        || !plan.academic_offering_id || !plan.offering_period_id) {
        return NextResponse.json({ error: 'Active class lesson plan not found' }, { status: 400 });
      }
      if (caller.role === 'teacher') {
        const { data: planClass } = await admin.from('classes')
          .select('teacher_id').eq('id', plan.class_id).maybeSingle();
        if (planClass?.teacher_id !== caller.id) {
          return NextResponse.json({ error: 'You can only use lesson plans for classes you own' }, { status: 403 });
        }
      }
      if (targetClassId && targetClassId !== plan.class_id) {
        return NextResponse.json({ error: 'Target class does not match the lesson plan' }, { status: 400 });
      }
      if (body.course_id && body.course_id !== plan.course_id) {
        return NextResponse.json({ error: 'Course does not match the lesson plan' }, { status: 400 });
      }
      if (resolvedSchoolId && plan.school_id && resolvedSchoolId !== plan.school_id) {
        return NextResponse.json({ error: 'School does not match the lesson plan' }, { status: 400 });
      }
      body.class_id = plan.class_id;
      body.course_id = plan.course_id;
      body.term_id = plan.term_id;
      body.academic_offering_id = plan.academic_offering_id;
      body.offering_period_id = plan.offering_period_id;
      body.school_id = plan.school_id;
      body.lesson_plan_id = plan.id;
      body.curriculum_release_id = plan.curriculum_release_id;
      body.metadata = { ...(body.metadata ?? {}), target_class_id: plan.class_id, lesson_plan_id: plan.id };
      resolvedSchoolId = plan.school_id;
    }
    if (assessmentScope === 'class_result' && !body.class_id) {
      return NextResponse.json({
        error: 'Choose the class whose report should receive this work, or switch it to Practice only.',
        code: 'CLASS_REQUIRED_FOR_RESULT',
      }, { status: 400 });
    }
    body.metadata = {
      ...(body.metadata ?? {}),
      assessment_scope: assessmentScope,
      result_eligible: assessmentScope === 'class_result',
      ...(body.class_id ? { target_class_id: body.class_id, visibility: 'class' } : {}),
    };
    const allowedFields = [
      'title', 'description', 'instructions', 'course_id', 'program_id', 'lesson_id',
      'due_date', 'max_points', 'assignment_type', 'is_active', 'questions', 'metadata',
      'class_id', 'weight', 'grading_mode', 'term_id', 'lesson_plan_id',
      'academic_offering_id', 'offering_period_id', 'project_template_id',
      'curriculum_release_id', 'curriculum_year_number', 'curriculum_term_number',
      'curriculum_week_number', 'session_number', 'learning_outcomes',
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
      payload.grading_mode = payload.questions.every(isAutoGradableAssignmentQuestion)
        ? 'auto'
        : 'manual';
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

    // Stamp academic session so gradebook / reports stay year+term isolated.
    const { resolveAssignmentTermId, loadTeachingPeriodFromClass } = await import('@/lib/assignments/session');
    const classIdForTerm =
      (payload.class_id as string | null | undefined)
      || ((payload.metadata as any)?.target_class_id as string | null | undefined)
      || null;
    if (!payload.term_id) {
      const period = await loadTeachingPeriodFromClass(admin, classIdForTerm, {
        class_id: classIdForTerm,
        school_id: (payload.school_id as string | null) ?? resolvedSchoolId ?? null,
        academic_offering_id:
          (payload.academic_offering_id as string | null | undefined) ?? null,
        offering_period_id:
          (payload.offering_period_id as string | null | undefined) ?? null,
        term_id: (payload.term_id as string | null | undefined) ?? null,
      });
      payload.term_id = await resolveAssignmentTermId(admin, {
        termId: body.term_id ?? null,
        classId: classIdForTerm,
        period,
      });
    }

    const { data, error } = await admin
      .from('assignments')
      .insert(payload)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    let notificationResult: Awaited<ReturnType<
      typeof import('@/lib/assignments/notifications')['triggerAssignmentReleaseNotifications']
    >> | null = null;
    if (data.is_active) {
      const { triggerAssignmentReleaseNotifications } = await import('@/lib/assignments/notifications');
      notificationResult = await triggerAssignmentReleaseNotifications(data.id, caller.id);
    }

    await logAudit(admin as any, {
      action: data.is_active ? 'publish_assignment' : 'create_assignment_draft',
      actorId: caller.id,
      resourceType: 'assignment',
      resourceId: data.id,
      newValue: `${data.is_active ? 'Published' : 'Created draft'} assignment: ${data.title}`,
      newValues: {
        title: data.title,
        school_id: data.school_id,
        class_id: data.class_id,
        course_id: data.course_id,
        term_id: data.term_id,
        lesson_plan_id: data.lesson_plan_id,
        grading_mode: data.grading_mode,
        is_active: data.is_active,
      },
    });

    return NextResponse.json({
      data,
      ...(notificationResult ? { notification: notificationResult } : {}),
      ...(notificationResult?.status === 'failed'
        ? {
            warning: 'The assignment is visible to students, but one or more alerts were not sent. An administrator can resend them from Office.',
          }
        : {}),
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
