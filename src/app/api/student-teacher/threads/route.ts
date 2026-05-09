import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

function adminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('id, role').eq('id', user.id).single();
  if (!profile || !['student', 'teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let q = (supabase as any)
    .from('student_teacher_threads')
    .select(`
      *,
      student:portal_users!student_teacher_threads_student_id_fkey(id, full_name, avatar_url, school_name, section_class),
      teacher:portal_users!student_teacher_threads_teacher_id_fkey(id, full_name, avatar_url),
      messages:student_teacher_messages(body, sent_at, is_read, sender_id)
    `)
    .order('updated_at', { ascending: false });

  if (profile.role === 'student') q = q.eq('student_id', user.id);
  else if (profile.role === 'teacher') q = q.eq('teacher_id', user.id);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const enriched = (data ?? []).map((t: any) => {
    const msgs: any[] = t.messages ?? [];
    const sorted = [...msgs].sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());
    const last = sorted[0];
    const unread = msgs.filter(m => !m.is_read && m.sender_id !== user.id).length;
    return {
      ...t,
      last_message_at: last?.sent_at || t.created_at,
      last_message_preview: last?.body || 'No messages yet',
      unread_count: unread,
    };
  });

  return NextResponse.json({ data: enriched });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('id, role').eq('id', user.id).single();
  if (!profile || !['student', 'teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const student_id = profile.role === 'student' ? user.id : (body.student_id ?? null);
  const teacher_id = profile.role === 'teacher' ? user.id : (body.teacher_id ?? null);

  if (!student_id || !teacher_id) {
    return NextResponse.json({ error: 'student_id and teacher_id are required' }, { status: 400 });
  }

  const { data: existing } = await (supabase as any)
    .from('student_teacher_threads')
    .select('*')
    .eq('student_id', student_id)
    .eq('teacher_id', teacher_id)
    .maybeSingle();

  if (existing) return NextResponse.json({ data: existing });

  const { data, error } = await (supabase as any)
    .from('student_teacher_threads')
    .insert({ student_id, teacher_id, subject: body.subject || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('id, role').eq('id', user.id).single();
  if (!profile || !['student', 'teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: thread } = await (supabase as any)
    .from('student_teacher_threads')
    .select('id, student_id, teacher_id')
    .eq('id', id)
    .single();
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isParticipant = thread.student_id === user.id || thread.teacher_id === user.id;
  if (!['admin', 'school'].includes(profile.role ?? '') && !isParticipant) {
    return NextResponse.json({ error: 'Only participants or admin can delete' }, { status: 403 });
  }

  const db = adminDb();
  await db.from('student_teacher_messages').delete().eq('thread_id', id);
  const { error } = await db.from('student_teacher_threads').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
