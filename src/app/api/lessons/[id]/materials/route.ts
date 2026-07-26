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
  if (!caller || !['admin', 'teacher'].includes(caller.role)) return null;
  return caller as Caller;
}

async function callerCanManageLesson(
  caller: Caller,
  lessonSchoolId: string | null,
  lessonCreatedBy: string | null,
): Promise<boolean> {
  if (caller.role === 'admin') return true;
  if (caller.role === 'teacher') {
    if (lessonCreatedBy === caller.id) return true;
    if (!lessonSchoolId) return false;
    if (caller.school_id === lessonSchoolId) return true;
    const scopedIds = await getTeacherSchoolIds(caller.id, caller.school_id);
    return scopedIds.includes(lessonSchoolId);
  }
  return false;
}

// POST /api/lessons/[id]/materials — add material to a lesson
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await requireStaff();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

    const { id: lesson_id } = await context.params;
    const admin = adminClient();

    // Fetch lesson to verify boundaries
    const { data: lesson } = await admin
      .from('lessons')
      .select('school_id, created_by')
      .eq('id', lesson_id)
      .maybeSingle();

    if (!lesson) {
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }

    const canManage = await callerCanManageLesson(caller, lesson.school_id, lesson.created_by);
    if (!canManage) {
      return NextResponse.json({ error: 'Access denied: lesson is outside your school scope' }, { status: 403 });
    }

    const body = await request.json();

    const { data, error } = await admin
      .from('lesson_materials')
      .insert({ ...body, lesson_id })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
