import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { evaluateAndTrackMessage } from '@/lib/communication/abusePolicy';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordCommunicationCaseEvent } from '@/lib/communication/cases';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: thread } = await supabase
    .from('parent_teacher_threads')
    .select('id, parent_id, teacher_id')
    .eq('id', id)
    .maybeSingle();
  if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 });

  const { data: me } = await supabase.from('portal_users').select('id, role').eq('id', user.id).maybeSingle();
  const isMember = thread.parent_id === user.id || thread.teacher_id === user.id;
  const isStaffOverride = ['admin', 'school'].includes(me?.role ?? '');
  if (!isMember && !isStaffOverride) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get('cursor');

  let query = supabase
    .from('parent_teacher_messages')
    .select('*, portal_users!sender_id(full_name, avatar_url)')
    .eq('thread_id', id)
    .order('sent_at', { ascending: false })
    .limit(50);

  if (cursor) query = query.lt('sent_at', cursor);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Mark messages as read
  await supabase
    .from('parent_teacher_messages')
    .update({ is_read: true })
    .eq('thread_id', id)
    .neq('sender_id', user.id);

  const nextCursor = data && data.length === 50 ? data[data.length - 1].sent_at : null;
  return NextResponse.json({ data: (data ?? []).reverse(), nextCursor });
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: thread } = await supabase
    .from('parent_teacher_threads')
    .select('id, parent_id, teacher_id, student_id')
    .eq('id', id)
    .maybeSingle();
  if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 });

  const { data: me } = await supabase.from('portal_users').select('id, role').eq('id', user.id).maybeSingle();
  const isMember = thread.parent_id === user.id || thread.teacher_id === user.id;
  const isStaffOverride = ['admin', 'school'].includes(me?.role ?? '');
  if (!isMember && !isStaffOverride) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { body } = await req.json();
  if (!body?.trim()) return NextResponse.json({ error: 'Message body is required', field: 'body' }, { status: 400 });

  const policy = await evaluateAndTrackMessage({
    senderId: user.id,
    senderRole: (me?.role ?? 'parent') as 'student' | 'parent' | 'teacher' | 'admin' | 'school',
    channel: 'inapp_direct',
    message: body.trim(),
    targetConversationId: id,
  });
  if (!policy.allowed) {
    return NextResponse.json(
      {
        error: policy.reason ?? 'Message blocked by safety policy',
        cooldown_remaining_seconds: policy.cooldownRemainingSeconds ?? null,
        remaining_daily: policy.remainingDaily ?? null,
        recommendation: policy.recommendation ?? 'none',
      },
      { status: policy.cooldownRemainingSeconds ? 429 : 403 },
    );
  }

  const { data, error } = await supabase
    .from('parent_teacher_messages')
    .insert({ thread_id: id, sender_id: user.id, body: body.trim() })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const admin = createAdminClient() as any;
    const { data: requester } = await admin.from('portal_users')
      .select('full_name, email, phone, school_id, primary_teacher_id')
      .eq('id', thread.parent_id)
      .maybeSingle();
    await recordCommunicationCaseEvent(admin, {
      requesterId: thread.parent_id,
      requesterName: requester?.full_name ?? null,
      requesterEmail: requester?.email ?? null,
      requesterPhone: requester?.phone ?? null,
      schoolId: requester?.school_id ?? null,
      classOwnerId: requester?.primary_teacher_id ?? thread.teacher_id,
      assignedTo: thread.teacher_id,
      subject: 'Parent-teacher conversation',
      body: body.trim(),
      category: 'academic',
      channel: 'in_app',
      direction: user.id === thread.parent_id ? 'inbound' : 'outbound',
      sourceType: 'parent_teacher_message',
      sourceId: data.id,
      actorId: user.id,
      metadata: { thread_id: id, student_id: thread.student_id },
    });
  } catch (caseError) {
    console.error('[parent-teacher/messages] unified case failed:', caseError);
  }
  return NextResponse.json(
    {
      data,
      policy: {
        remaining_daily: policy.remainingDaily ?? null,
        recommendation: policy.recommendation ?? 'none',
      },
    },
    { status: 201 },
  );
}
