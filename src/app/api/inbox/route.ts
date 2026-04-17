import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireStaff(req: NextRequest) {
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

  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) {
    throw new Error('Forbidden: Staff access required');
  }

  return profile;
}

// GET /api/inbox — list WhatsApp conversations for staff
export async function GET(req: NextRequest) {
  try {
    const caller = await requireStaff(req);
    const admin = adminClient();

    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get('conversation_id');

    // If conversation_id is provided, return messages for that conversation
    if (conversationId) {
      const limit = parseInt(searchParams.get('limit') || '100', 10);

      // Verify conversation exists
      const { data: conversation, error: convErr } = await admin
        .from('whatsapp_conversations')
        .select('id')
        .eq('id', conversationId)
        .single();

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

    // Otherwise, fetch conversations list
    const { data: conversations, error } = await admin
      .from('whatsapp_conversations')
      .select(`
        *,
        portal_users:portal_user_id(id, full_name, email, phone)
      `)
      .order('last_message_at', { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: conversations });
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : err.message === 'Forbidden: Staff access required' ? 403 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
