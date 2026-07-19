import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireInboxUser(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();

  if (authErr || !user) {
    throw new Error('Unauthorized');
  }

  const admin = adminClient();
  const { data: profile } = await admin
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'teacher', 'school', 'parent', 'student'].includes(profile.role)) {
    throw new Error('Forbidden: Inbox access denied');
  }

  return profile;
}

async function teacherSchoolIds(callerId: string, primarySchoolId: string | null): Promise<string[]> {
  const ids: string[] = [];
  if (primarySchoolId) ids.push(primarySchoolId);
  const admin = adminClient();
  const { data: ts } = await admin
    .from('teacher_schools')
    .select('school_id')
    .eq('teacher_id', callerId);
  (ts ?? []).forEach((r: any) => {
    if (r.school_id && !ids.includes(r.school_id)) ids.push(r.school_id);
  });
  return ids;
}

// GET /api/inbox — list WhatsApp conversations for role-scoped users
export async function GET(req: NextRequest) {
  try {
    const caller = await requireInboxUser(req);
    const admin = adminClient();

    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get('conversation_id');

    // If conversation_id is provided, return messages for that conversation
    if (conversationId) {
      const rawLimit = parseInt(searchParams.get('limit') || '100', 10);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 100;

      // Verify conversation exists and is in scope for caller
      let convScope = admin
        .from('whatsapp_conversations')
        .select('id, portal_user_id, assigned_staff_id')
        .eq('id', conversationId);

      if (caller.role === 'parent' || caller.role === 'student') {
        convScope = convScope.eq('portal_user_id', caller.id);
      } else if (caller.role === 'teacher') {
        const schoolIds = await teacherSchoolIds(caller.id, caller.school_id);
        if (schoolIds.length === 0) return NextResponse.json({ error: 'Teacher school not assigned' }, { status: 403 });

        // Use a subquery to verify the student's school is in the teacher's schools
        const { data: validStudent } = await admin
          .from('whatsapp_conversations')
          .select('id, portal_users!inner(school_id)')
          .eq('id', conversationId)
          .in('portal_users.school_id', schoolIds)
          .maybeSingle();

        if (!validStudent) {
          return NextResponse.json({ error: 'Access denied: student not in your school' }, { status: 403 });
        }
      }

      const { data: conversation, error: convErr } = await convScope.single();

      if (convErr || !conversation) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      }

      // Fetch messages for the conversation
      const messageSelect = ['admin', 'teacher', 'school'].includes(caller.role) 
        ? '*' 
        : 'id, conversation_id, direction, body, status, created_at, is_read';

      const { data: messages, error } = await admin
        .from('whatsapp_messages')
        .select(messageSelect)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) {
        console.error('[inbox] database query failed:', error.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }

      // Mark conversation as read
      const isOwnerOrAdmin = caller.role === 'parent' || caller.role === 'student' || caller.role === 'admin' || conversation?.assigned_staff_id === caller.id;
      if (isOwnerOrAdmin) {
        await admin
          .from('whatsapp_conversations')
          .update({ unread_count: 0, updated_at: new Date().toISOString() })
          .eq('id', conversationId);
      }

      return NextResponse.json({ data: messages });
    }

    // Otherwise, fetch role-scoped conversation list.
    // Left join portal_users so external contacts (no portal_user_id) are included.
    const rawListLimit = Number.parseInt(searchParams.get('limit') || '50', 10);
    const listLimit = Number.isFinite(rawListLimit) && rawListLimit > 0 ? Math.min(rawListLimit, 50) : 50;
    let convQuery = admin
      .from('whatsapp_conversations')
      .select(`
        id, phone_number, contact_name, portal_user_id, assigned_staff_id,
        last_message_at, last_message_preview, unread_count, opted_out, created_at,
        portal_users(id, full_name, email, phone, school_id, school_name, role)
      `)
      .order('last_message_at', { ascending: false })
      .limit(listLimit);
    if (caller.role === 'parent' || caller.role === 'student') {
      convQuery = convQuery.eq('portal_user_id', caller.id);
    } else if (caller.role === 'teacher') {
      // Teachers see only conversations assigned to them.
      convQuery = convQuery.eq('assigned_staff_id', caller.id);
    } else if (caller.role === 'school') {
      // School admins see conversations for their own school's users only.
      if (caller.school_id) {
        const { data: schoolUsers } = await admin
          .from('portal_users')
          .select('id')
          .eq('school_id', caller.school_id);
        const userIds = (schoolUsers ?? []).map((u: any) => u.id);
        if (userIds.length === 0) return NextResponse.json({ data: [] });
        convQuery = convQuery.in('portal_user_id', userIds);
      } else {
        return NextResponse.json({ data: [] });
      }
    }
    // admin: no additional filter — sees all conversations

    const { data: conversations, error } = await convQuery;

    if (error) {
      console.error('[inbox] database query failed:', error.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    return NextResponse.json({ data: conversations });
  } catch (err: any) {
    const isAuthError = ['Unauthorized', 'Forbidden: Inbox access denied'].includes(err?.message);
    const safeMessage = isAuthError ? err.message : 'Internal server error';
    const status = err?.message === 'Unauthorized' ? 401 : err?.message === 'Forbidden: Inbox access denied' ? 403 : 500;
    return NextResponse.json({ error: safeMessage }, { status });
  }
}

// POST /api/inbox — Start or retrieve a conversation for parent/student
export async function POST(req: NextRequest) {
  try {
    const caller = await requireInboxUser(req);
    const admin = adminClient();

    if (caller.role !== 'parent' && caller.role !== 'student') {
      return NextResponse.json({ error: 'Only parents and students can use this endpoint' }, { status: 403 });
    }

    const { data: fullProfile } = await admin.from('portal_users')
      .select('full_name, phone').eq('id', caller.id).single();
    const { data: result, error } = await (admin as any).rpc('get_or_create_inbox_conversation', {
      p_portal_user_id: caller.id,
      p_contact_name: fullProfile?.full_name || 'User',
      p_phone_number: fullProfile?.phone || '',
    });
    if (error || !result?.conversation) {
      console.error('[inbox] atomic conversation creation failed:', error?.message);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
    const newConv = result.conversation;
    if (!result.created) return NextResponse.json({ data: newConv });
    // Add initial welcome message
    await admin
      .from('whatsapp_messages')
      .insert({
        conversation_id: newConv.id,
        direction: 'outbound',
        body: `Hello ${fullProfile?.full_name || 'there'}! 👋 Welcome to Rillcod Support. How can we help you with your learning journey today?`,
        status: 'delivered',
      });

    // Update last message preview
    await admin
      .from('whatsapp_conversations')
      .update({ 
        last_message_preview: 'Welcome to Rillcod Support!',
        last_message_at: new Date().toISOString()
      })
      .eq('id', newConv.id);

    return NextResponse.json({ data: newConv });
  } catch (err: any) {
    const isAuthError = ['Unauthorized', 'Forbidden: Inbox access denied'].includes(err?.message);
    const safeMessage = isAuthError ? err.message : 'Internal server error';
    const status = err?.message === 'Unauthorized' ? 401 : err?.message === 'Forbidden: Inbox access denied' ? 403 : 500;
    return NextResponse.json({ error: safeMessage }, { status });
  }
}
