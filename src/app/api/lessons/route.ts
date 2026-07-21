import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { normalizeLessonType } from '@/lib/lessons/lesson-type';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireStaff() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id, school_id')
    .eq('id', user.id)
    .single();
  if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) return null;
  return caller;
}

async function getTeacherSchoolIds(teacherId: string, fallbackSchoolId: string | null) {
  const ids = new Set<string>();
  if (fallbackSchoolId) ids.add(fallbackSchoolId);
  const admin = adminClient();
  const { data } = await admin
    .from('teacher_schools')
    .select('school_id')
    .eq('teacher_id', teacherId);
  for (const row of data ?? []) {
    const sid = (row as { school_id: string | null }).school_id;
    if (sid) ids.add(sid);
  }
  return Array.from(ids);
}

function canCreateLesson(role: string | undefined) {
  return role === 'admin' || role === 'teacher';
}

// GET /api/lessons — list lessons visible to current user
export async function GET(request: NextRequest) {
  try {
    const caller = await requireStaff();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

    const url = new URL(request.url);
    const lessonPlanId = url.searchParams.get('lesson_plan_id');
    const courseId = url.searchParams.get('course_id');

    const admin = adminClient();
    let query = admin
      .from('lessons')
      .select(`
        id, title, description, lesson_type, status, duration_minutes,
        session_date, video_url, created_by, created_at, metadata,
        school_id,
        courses ( id, title, programs ( name ) )
      `)
      .order('created_at', { ascending: false });

    if (lessonPlanId) {
      query = query.eq('lesson_plan_id', lessonPlanId) as any;
    }
    if (courseId) {
      query = query.eq('course_id', courseId) as any;
    }

    if (caller.role === 'teacher') {
      query = query.eq('created_by', caller.id) as any;
    } else if (caller.role === 'school') {
      if (!caller.school_id) {
        return NextResponse.json({ error: 'School context required: account must be linked to a school.' }, { status: 403 });
      }
      query = query.eq('school_id', caller.school_id) as any;
    }
    // admin: no filter — all lessons visible

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// POST /api/lessons — create a lesson (bypasses RLS)
export async function POST(request: NextRequest) {
  try {
    const caller = await requireStaff();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    if (!canCreateLesson(caller.role)) {
      return NextResponse.json({ error: 'Only admin and teacher can create lessons' }, { status: 403 });
    }

    const body = await request.json();
    const allowed = ['title', 'description', 'content', 'lesson_type', 'status',
      'duration_minutes', 'order_index', 'video_url', 'course_id',
      'session_date', 'content_layout', 'lesson_notes', 'metadata'];
    const payload: Record<string, unknown> = { created_by: caller.id };
    for (const f of allowed) {
      if (f in body) payload[f] = body[f] ?? null;
    }

    // Resolve school_id — teacher must post to an assigned school
    let resolvedSchoolId: string | null = null;
    if (caller.role === 'admin') {
      resolvedSchoolId = typeof body.school_id === 'string' ? body.school_id : null;
    } else if (caller.role === 'teacher') {
      const requestedSchoolId: string | null = typeof body.school_id === 'string' ? body.school_id : null;
      const scopedIds = await getTeacherSchoolIds(caller.id, caller.school_id);
      if (requestedSchoolId) {
        if (!scopedIds.includes(requestedSchoolId)) {
          return NextResponse.json(
            { error: 'You are not assigned to the school you selected for this lesson.' },
            { status: 403 },
          );
        }
        resolvedSchoolId = requestedSchoolId;
      } else {
        resolvedSchoolId = caller.school_id ?? scopedIds[0] ?? null;
      }
    }

    // Verify course_id belongs to the resolved school/caller's boundary
    if (body.course_id) {
      const { data: course } = await adminClient()
        .from('courses')
        .select('school_id')
        .eq('id', body.course_id)
        .maybeSingle();

      if (!course) {
        return NextResponse.json({ error: 'Selected course not found' }, { status: 400 });
      }

      if (course.school_id) {
        if (caller.role === 'teacher') {
          const scopedIds = await getTeacherSchoolIds(caller.id, caller.school_id);
          if (!scopedIds.includes(course.school_id)) {
            return NextResponse.json({ error: 'You are not assigned to the school of this course.' }, { status: 403 });
          }
        }
        resolvedSchoolId = course.school_id;
      }
    }

    // Canonical class workflow: a lesson may only inherit scope from its plan.
    if (body.lesson_plan_id) {
      const { data: plan } = await adminClient().from('lesson_plans')
        .select('id, class_id, course_id, term_id, school_id, status')
        .eq('id', body.lesson_plan_id).maybeSingle();
      if (!plan || plan.status === 'archived') {
        return NextResponse.json({ error: 'Active lesson plan not found' }, { status: 400 });
      }
      if (!plan.class_id || !plan.term_id || !plan.course_id) {
        return NextResponse.json({ error: 'Lesson plan is not linked to a class, course and academic term' }, { status: 400 });
      }
      if (caller.role === 'teacher') {
        const { data: klass } = await adminClient().from('classes').select('teacher_id').eq('id', plan.class_id).maybeSingle();
        if (!klass || klass.teacher_id !== caller.id) {
          return NextResponse.json({ error: 'You can only add lessons to your assigned class plan' }, { status: 403 });
        }
      }
      payload.lesson_plan_id = plan.id;
      payload.class_id = plan.class_id;
      payload.academic_term_id = plan.term_id;
      payload.course_id = plan.course_id;
      resolvedSchoolId = plan.school_id;
      payload.metadata = { ...(typeof body.metadata === 'object' && body.metadata ? body.metadata : {}), lesson_plan_id: plan.id };
    }
    payload.school_id = resolvedSchoolId;
    if (typeof payload.lesson_type === 'string') {
      payload.lesson_type = normalizeLessonType(payload.lesson_type, 'lesson');
    }
    payload.created_at = new Date().toISOString();

    const { data, error } = await adminClient()
      .from('lessons')
      .insert(payload)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // If lesson_plan data is included, save it and return its id
    let lesson_plan_id: string | null = null;
    if (body.lesson_plan && data?.id) {
      const plan = body.lesson_plan;
      const { data: planRow } = await adminClient().from('lesson_plans').insert({
        lesson_id: data.id,
        course_id: body.course_id ?? null,
        objectives: plan.objectives ?? null,
        activities: plan.activities ?? null,
        assessment_methods: plan.assessment_methods ?? null,
        staff_notes: plan.staff_notes ?? null,
        plan_data: plan.plan_data ?? null,
        covers_full_course: plan.covers_full_course ?? false,
      }).select('id').single();
      lesson_plan_id = planRow?.id ?? null;
    }

    return NextResponse.json({ data: { ...data, lesson_plan_id } }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
