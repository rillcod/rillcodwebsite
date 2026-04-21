import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessLessonScope } from '../authz';

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  return data ? { ...user, role: data.role, school_id: data.school_id } : null;
}

async function getTeacherSchoolIds(teacherId: string, fallbackSchoolId: string | null) {
  const ids = new Set<string>();
  if (fallbackSchoolId) ids.add(fallbackSchoolId);
  const db = createAdminClient();
  const { data } = await db
    .from('teacher_schools')
    .select('school_id')
    .eq('teacher_id', teacherId);
  for (const row of data ?? []) {
    const sid = (row as { school_id: string | null }).school_id;
    if (sid) ids.add(sid);
  }
  return Array.from(ids);
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const db = createAdminClient();

  const { data, error } = await db.from('lesson_plans').select(`
    *,
    courses(id, title),
    classes(id, name),
    schools(id, name),
    lessons(id, title, description, course_id, school_id, created_by, lesson_type, status, duration_minutes)
  `).eq('id', id).single();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (user.role !== 'admin') {
    const teacherSchoolIds =
      user.role === 'teacher' ? await getTeacherSchoolIds(user.id, user.school_id) : [];
    const allowed = canAccessLessonScope(
      { id: user.id, role: user.role, school_id: user.school_id },
      {
        school_id: (data as any)?.lessons?.school_id ?? (data as any)?.school_id ?? null,
        created_by: (data as any)?.lessons?.created_by ?? (data as any)?.created_by ?? null,
      },
      teacherSchoolIds,
    );
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json({ data });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || !['admin', 'teacher'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const db = createAdminClient();

  const { data: existingPlan, error: existingErr } = await db
    .from('lesson_plans')
    .select('id, school_id, created_by, lessons(school_id, created_by)')
    .eq('id', id)
    .maybeSingle();
  if (existingErr || !existingPlan) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // For term-level plans (no lesson_id), scope by plan.school_id or plan.created_by
  const planSchoolId = (existingPlan as any)?.lessons?.school_id ?? (existingPlan as any)?.school_id ?? null;
  const planCreatedBy = (existingPlan as any)?.lessons?.created_by ?? (existingPlan as any)?.created_by ?? null;

  const teacherSchoolIds =
    user.role === 'teacher' ? await getTeacherSchoolIds(user.id, user.school_id) : [];
  const allowed = user.role === 'admin' || canAccessLessonScope(
    { id: user.id, role: user.role, school_id: user.school_id },
    { school_id: planSchoolId, created_by: planCreatedBy },
    teacherSchoolIds,
  );
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await db.from('lesson_plans')
    .update({ ...body, updated_at: new Date().toISOString() } as any)
    .eq('id', id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await context.params;
  const db = createAdminClient();

  const { error } = await db.from('lesson_plans').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
