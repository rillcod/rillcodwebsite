import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getTeacherSchoolIds } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Caller = { role: string; id: string; school_id: string | null };

async function requireStaff(): Promise<Caller | null> {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id, school_id')
    .eq('id', user.id)
    .single();
  if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) return null;
  return caller as Caller;
}

async function callerCanManageLesson(
  caller: Caller,
  lessonSchoolId: string | null,
  lessonCreatedBy: string | null,
): Promise<boolean> {
  if (caller.role === 'admin') return true;
  if (caller.role === 'school') {
    return !!caller.school_id && lessonSchoolId === caller.school_id;
  }
  if (caller.role === 'teacher') {
    if (lessonCreatedBy === caller.id) return true;
    return false;
  }
  return false;
}

// GET /api/lessons/[id]
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await requireStaff();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

    const { id } = await context.params;
    const { data, error } = await adminClient()
      .from('lessons')
      .select('*, courses ( id, title, programs ( name ) ), lesson_plans!lessons_lesson_plan_id_fkey (*)')
      .eq('id', id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });

    const canManage = await callerCanManageLesson(caller, data.school_id, data.created_by);
    if (!canManage) {
      return NextResponse.json({ error: 'Access denied: lesson is outside your school scope' }, { status: 403 });
    }

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// PATCH /api/lessons/[id] — update lesson
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await requireStaff();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    if (caller.role === 'school') return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const { id } = await context.params;
    const admin = adminClient();

    const { data: existing } = await admin.from('lessons').select('school_id, created_by').eq('id', id).maybeSingle();
    if (!existing) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });

    const canManage = await callerCanManageLesson(caller, existing.school_id, existing.created_by);
    if (!canManage) {
      return NextResponse.json({ error: 'Access denied: lesson is outside your school scope' }, { status: 403 });
    }

    const body = await request.json();

    // Verify course_id if updated
    let nextCourseSchoolId: string | null | undefined;
    if (body.course_id) {
      const { data: course } = await admin
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
      }
      nextCourseSchoolId = course.school_id ?? null;
    }

    const allowed: Record<string, unknown> = {};
    const allowedFields = ['title', 'description', 'content', 'lesson_notes', 'lesson_type', 'status',
      'duration_minutes', 'order_index', 'video_url', 'session_date', 'content_layout', 'course_id', 'metadata'];
    for (const f of allowedFields) {
      if (f in body) allowed[f] = body[f] ?? null;
    }
    if (nextCourseSchoolId !== undefined) allowed.school_id = nextCourseSchoolId;
    allowed.updated_at = new Date().toISOString();

    const { error } = await admin.from('lessons').update(allowed).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Optionally upsert lesson_plan if included in body
    if (body.lesson_plan && typeof body.lesson_plan === 'object') {
      await admin.from('lesson_plans').upsert(
        { ...body.lesson_plan, lesson_id: id, updated_at: new Date().toISOString() },
        { onConflict: 'lesson_id' },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// PUT /api/lessons/[id] — alias for PATCH
export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return PATCH(request, ctx);
}

// DELETE /api/lessons/[id]
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await requireStaff();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    if (caller.role === 'school') return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const { id } = await context.params;
    const admin = adminClient();

    const { data: existing } = await admin.from('lessons').select('school_id, created_by').eq('id', id).maybeSingle();
    if (!existing) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });

    const canManage = await callerCanManageLesson(caller, existing.school_id, existing.created_by);
    if (!canManage) {
      return NextResponse.json({ error: 'Access denied: lesson is outside your school scope' }, { status: 403 });
    }

    const { error } = await admin
      .from('lessons')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
