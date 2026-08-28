import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import {
  loadCleanupPolicy,
  mayHardDeleteRebuildableContent,
  STRICT_CLEANUP_MESSAGE,
} from '@/lib/operations/cleanup-policy';
import {
  lessonTeachingGuideFromMetadata,
  metadataWithLessonTeachingGuide,
} from '@/lib/lessons/teaching-guide';

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
  lessonClassId?: string | null,
): Promise<boolean> {
  if (caller.role === 'admin') return true;
  if (caller.role === 'school') {
    return !!caller.school_id && lessonSchoolId === caller.school_id;
  }
  if (caller.role === 'teacher') {
    if (lessonCreatedBy === caller.id) return true;
    // A class teacher may maintain shared/AI-created lessons in their class.
    // Ownership of the row is not the teaching assignment boundary.
    if (lessonClassId) {
      const { data: klass } = await adminClient()
        .from('classes')
        .select('teacher_id')
        .eq('id', lessonClassId)
        .maybeSingle();
      return klass?.teacher_id === caller.id;
    }
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
      .select('*, courses ( id, title, programs ( name ) ), class_plan:lesson_plans!lessons_lesson_plan_id_fkey (*)')
      .eq('id', id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });

    const canManage = await callerCanManageLesson(caller, data.school_id, data.created_by, data.class_id);
    if (!canManage) {
      return NextResponse.json({ error: 'Access denied: lesson is outside your school scope' }, { status: 403 });
    }

    return NextResponse.json({
      data: {
        ...data,
        teaching_guide: lessonTeachingGuideFromMetadata(data.metadata),
      },
    });
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
    const { data: existing } = await admin
      .from('lessons')
      .select('school_id, created_by, metadata, lesson_plan_id, class_id, course_id')
      .eq('id', id)
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });

    const canManage = await callerCanManageLesson(caller, existing.school_id, existing.created_by, existing.class_id);
    if (!canManage) {
      return NextResponse.json({ error: 'Access denied: lesson is outside your school scope' }, { status: 403 });
    }

    const body = await request.json();

    // Verify course_id if updated
    let nextCourseSchoolId: string | null | undefined;
    if (
      body.course_id &&
      existing.lesson_plan_id &&
      body.course_id !== existing.course_id
    ) {
      return NextResponse.json(
        {
          error:
            'This lesson belongs to a class plan. Change the course from the class workflow instead of moving one lesson out of its plan.',
          code: 'CLASS_PLAN_SCOPE_LOCKED',
        },
        { status: 409 },
      );
    }

    if (body.course_id && !existing.lesson_plan_id) {
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
    const allowedFields = ['title', 'description', 'content', 'lesson_notes', 'lesson_type',
      'duration_minutes', 'order_index', 'video_url', 'session_date', 'content_layout'];
    for (const f of allowedFields) {
      if (f in body) allowed[f] = body[f] ?? null;
    }
    if ('metadata' in body) allowed.metadata = body.metadata ?? {};
    // A class lesson becomes visible only through the shared week release.
    // Standalone historical rows may still retain their old status editor.
    if ('status' in body && !existing.lesson_plan_id) {
      allowed.status = body.status ?? 'draft';
    }
    if (body.course_id && !existing.lesson_plan_id) {
      allowed.course_id = body.course_id;
    }

    // Compatibility: older editor builds called this `lesson_plan`. It is now
    // folded into the lesson's own teaching guide instead of creating a second,
    // reverse-linked row in the class-plan table.
    const guideInput = body.teaching_guide ?? body.lesson_plan;
    if (guideInput && typeof guideInput === 'object') {
      allowed.metadata = metadataWithLessonTeachingGuide(
        allowed.metadata ?? existing.metadata,
        guideInput,
      );
    }
    if (nextCourseSchoolId !== undefined) allowed.school_id = nextCourseSchoolId;
    allowed.updated_at = new Date().toISOString();

    const { error } = await admin.from('lessons').update(allowed).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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

    const { data: existing } = await admin
      .from('lessons')
      .select('school_id, created_by, class_id, lesson_plan_id')
      .eq('id', id)
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });

    const canManage = await callerCanManageLesson(
      caller,
      existing.school_id,
      existing.created_by,
      existing.class_id,
    );
    if (!canManage) {
      return NextResponse.json({ error: 'Access denied: lesson is outside your school scope' }, { status: 403 });
    }

    const cleanupPolicy = await loadCleanupPolicy(admin as any);
    if (!mayHardDeleteRebuildableContent(cleanupPolicy)) {
      return NextResponse.json({ error: STRICT_CLEANUP_MESSAGE, code: 'STRICT_RETENTION' }, { status: 409 });
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
