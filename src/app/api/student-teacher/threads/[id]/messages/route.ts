import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { evaluateAndTrackMessage } from '@/lib/communication/abusePolicy';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: thread } = await (supabase as any)
    .from('student_teacher_threads')
    .select('id, student_id, teacher_id')
    .eq('id', id)
    .maybeSingle();
  if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 });

  const { data: me } = await supabase.from('portal_users').select('id, role').eq('id', user.id).maybeSingle();
  const isMember = thread.student_id === user.id || thread.teacher_id === user.id;
  const isStaffOverride = ['admin', 'school'].includes(me?.role ?? '');
  if (!isMember && !isStaffOverride) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await (supabase as any)
    .from('student_teacher_messages')
    .select('*')
    .eq('thread_id', id)
    .order('sent_at', { ascending: true })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (supabase as any)
    .from('student_teacher_messages')
    .update({ is_read: true })
    .eq('thread_id', id)
    .neq('sender_id', user.id);

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: thread } = await (supabase as any)
    .from('student_teacher_threads')
    .select('id, student_id, teacher_id')
    .eq('id', id)
    .maybeSingle();
  if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 });

  const { data: me } = await supabase.from('portal_users').select('id, role').eq('id', user.id).maybeSingle();
  const isMember = thread.student_id === user.id || thread.teacher_id === user.id;
  const isStaffOverride = ['admin', 'school'].includes(me?.role ?? '');
  if (!isMember && !isStaffOverride) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const reqBody = await req.json();
  const msgBody = reqBody.body;
  if (!msgBody?.trim()) return NextResponse.json({ error: 'Message body is required' }, { status: 400 });

  const policy = await evaluateAndTrackMessage({
    senderId: user.id,
    senderRole: (me?.role ?? 'student') as 'student' | 'parent' | 'teacher' | 'admin' | 'school',
    channel: 'inapp_direct',
    message: msgBody.trim(),
    targetConversationId: id,
  });
  if (!policy.allowed) {
    return NextResponse.json(
      {
        error: policy.reason ?? 'Message blocked by safety policy',
        cooldown_remaining_seconds: policy.cooldownRemainingSeconds ?? null,
        remaining_daily: policy.remainingDaily ?? null,
      },
      { status: policy.cooldownRemainingSeconds ? 429 : 403 },
    );
  }

  const { data, error } = await (supabase as any)
    .from('student_teacher_messages')
    .insert({ thread_id: id, sender_id: user.id, body: msgBody.trim() })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (supabase as any)
    .from('student_teacher_threads')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', id);

  return NextResponse.json({ data }, { status: 201 });
}
