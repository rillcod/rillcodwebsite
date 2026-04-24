import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  return data ? { ...user, role: data.role, school_id: (data as any).school_id ?? null } : null;
}

async function getTeacherSchoolIds(teacherId: string, fallbackSchoolId: string | null) {
  const db = createAdminClient();
  const ids = new Set<string>();
  if (fallbackSchoolId) ids.add(fallbackSchoolId);
  const { data } = await db.from('teacher_schools').select('school_id').eq('teacher_id', teacherId);
  for (const row of data ?? []) {
    const sid = (row as { school_id: string | null }).school_id;
    if (sid) ids.add(sid);
  }
  return Array.from(ids);
}

async function canManageExam(user: any, examId: string) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const db = createAdminClient();
  const { data: exam } = await db
    .from('exams')
    .select('id, created_by, course_id, courses!course_id(school_id)')
    .eq('id', examId)
    .maybeSingle();
  if (!exam) return false;
  const courseSchoolId = (exam as any)?.courses?.school_id as string | null;
  if (user.role === 'teacher') {
    if ((exam as any).created_by === user.id) return true;
    const schoolIds = await getTeacherSchoolIds(user.id, user.school_id ?? null);
    return !!courseSchoolId && schoolIds.includes(courseSchoolId);
  }
  if (user.role === 'school') return !!user.school_id && !!courseSchoolId && user.school_id === courseSchoolId;
  return false;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string; qid: string }> }) {
  const user = await getUser();
  if (!user || user.role === 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: exam_id, qid } = await context.params;
  if (!(await canManageExam(user as any, exam_id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await request.json();
  const db = createAdminClient();

  const { data, error } = await db.from('exam_questions')
    .update(body as any)
    .eq('id', qid)
    .eq('exam_id', exam_id)
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string; qid: string }> }) {
  const user = await getUser();
  if (!user || user.role === 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: exam_id, qid } = await context.params;
  if (!(await canManageExam(user as any, exam_id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const db = createAdminClient();

  const { error } = await db.from('exam_questions').delete().eq('id', qid).eq('exam_id', exam_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
