import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

async function getCaller() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient() as any;
  const { data } = await admin.from('portal_users')
    .select('id, role, school_id, full_name').eq('id', user.id).single();
  return data ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = createAdminClient() as any;
    const rawLimit = Number.parseInt(new URL(request.url).searchParams.get('limit') || '50', 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50;
    let query = admin.from('parent_teacher_threads').select(`
      id, parent_id, teacher_id, student_id, created_at, updated_at,
      parent:portal_users!parent_teacher_threads_parent_id_fkey(id, full_name, email, phone, school_name, section_class),
      teacher:portal_users!parent_teacher_threads_teacher_id_fkey(id, full_name),
      messages:parent_teacher_messages(body, sent_at, is_read, sender_id)
    `).order('updated_at', { ascending: false }).limit(limit);

    if (caller.role === 'parent') query = query.eq('parent_id', caller.id);
    else if (caller.role === 'student') query = query.eq('student_id', caller.id);
    else if (caller.role === 'teacher') query = query.eq('teacher_id', caller.id);
    else if (caller.role === 'school') {
      const { data: teachers } = await admin.from('portal_users')
        .select('id').eq('school_id', caller.school_id).eq('role', 'teacher');
      const ids = (teachers ?? []).map((row: any) => row.id);
      if (!ids.length) return NextResponse.json({ data: [] });
      query = query.in('teacher_id', ids);
    } else if (caller.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error('[inbox/threads GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['admin', 'teacher', 'school', 'parent'].includes(caller.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const admin = createAdminClient() as any;
    const parentId = caller.role === 'parent' ? caller.id : String(body.parent_id ?? '');
    const teacherId = caller.role === 'teacher' ? caller.id : String(body.teacher_id ?? '');
    if (!parentId || !teacherId) return NextResponse.json({ error: 'parent_id and teacher_id are required' }, { status: 400 });

    const [{ data: parent }, { data: teacher }] = await Promise.all([
      admin.from('portal_users').select('id, role').eq('id', parentId).maybeSingle(),
      admin.from('portal_users').select('id, role, school_id').eq('id', teacherId).maybeSingle(),
    ]);
    if (parent?.role !== 'parent' || teacher?.role !== 'teacher') {
      return NextResponse.json({ error: 'Invalid parent or teacher' }, { status: 400 });
    }
    if (caller.role === 'school' && teacher.school_id !== caller.school_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: links } = await admin.from('parent_student_links').select('student_id').eq('parent_id', parentId);
    const studentIds = (links ?? []).map((row: any) => row.student_id).filter(Boolean);
    if (!studentIds.length) return NextResponse.json({ error: 'Parent has no linked student' }, { status: 400 });
    const { data: students } = await admin.from('portal_users')
      .select('id, school_id').in('id', studentIds).eq('role', 'student');
    const linkedStudent = (students ?? []).find((row: any) => row.school_id === teacher.school_id);
    if (!linkedStudent) return NextResponse.json({ error: 'Parent is not linked to a student in the teacher school' }, { status: 403 });

    const { data: existing } = await admin.from('parent_teacher_threads').select('id, parent_id, teacher_id, student_id, created_at, updated_at')
      .eq('parent_id', parentId).eq('teacher_id', teacherId).eq('student_id', linkedStudent.id).maybeSingle();
    if (existing) return NextResponse.json({ data: existing });

    const { data, error } = await admin.from('parent_teacher_threads').insert({
      parent_id: parentId, teacher_id: teacherId, student_id: linkedStudent.id,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error('[inbox/threads POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}