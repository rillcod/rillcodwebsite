import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
  return data ? { ...user, role: data.role } : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; qid: string }> }) {
  const user = await getUser();
  if (!user || user.role === 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: exam_id, qid } = await params;
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

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; qid: string }> }) {
  const user = await getUser();
  if (!user || user.role === 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: exam_id, qid } = await params;
  const db = createAdminClient();

  const { error } = await db.from('exam_questions').delete().eq('id', qid).eq('exam_id', exam_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
