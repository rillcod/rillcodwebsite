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

  if (!profile || !['admin', 'teacher', 'parent', 'student'].includes(profile.role)) {
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
      const limit = parseInt(searchParams.get('limit') || '100', 10);

      // Verify conversation exists and is in scope for caller
      let convScope = admin
        .from('whatsapp_conversations')
        .select('id, portal_user_id')
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
      const { data: messages, error } = await admin
        .from('whatsapp_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(Math.min(limit, 500));

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Mark conversation as read
      await admin
        .from('whatsapp_conversations')
        .update({ unread_count: 0, updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      return NextResponse.json({ data: messages });
    }

    // Otherwise, fetch role-scoped conversation list
    let convQuery = admin
      .from('whatsapp_conversations')
      .select(`
        *,
        portal_users!inner(id, full_name, email, phone, school_id)
      `)
      .order('last_message_at', { ascending: false })
      .limit(100);

    if (caller.role === 'parent' || caller.role === 'student') {
      convQuery = convQuery.eq('portal_user_id', caller.id);
    } else if (caller.role === 'teacher') {
      const schoolIds = await teacherSchoolIds(caller.id, caller.school_id);
      if (schoolIds.length === 0) return NextResponse.json({ data: [] });
      convQuery = convQuery.in('portal_users.school_id', schoolIds);
    }

    const { data: conversations, error } = await convQuery;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: conversations });
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : err.message === 'Forbidden: Inbox access denied' ? 403 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
