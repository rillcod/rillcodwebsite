import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// POST /api/inbox/conversation
// Finds or creates a whatsapp_conversations row for a given phone number.
// Teachers automatically become the assigned_staff_id so replies route back to them.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { data: profile } = await admin
      .from('portal_users')
      .select('id, role, school_id')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { phone_number, portal_user_id, contact_name } = body;
    if (!phone_number) return NextResponse.json({ error: 'phone_number required' }, { status: 400 });
    const phone = String(phone_number).replace(/\D/g, '');

    // Find existing conversation by phone number
    const { data: existing } = await admin
      .from('whatsapp_conversations')
      .select('*')
      .eq('phone_number', phone)
      .maybeSingle();

    if (existing) {
      // Teacher claims an unassigned conversation into their contact list
      if (profile.role === 'teacher' && !existing.assigned_staff_id) {
        await admin
          .from('whatsapp_conversations')
          .update({ assigned_staff_id: profile.id })
          .eq('id', existing.id);
        return NextResponse.json({ data: { ...existing, assigned_staff_id: profile.id } });
      }
      return NextResponse.json({ data: existing });
    }

    // Create new conversation — teachers own their new contacts
    const insertPayload: Record<string, unknown> = {
      phone_number: phone,
      contact_name: contact_name || phone,
      portal_user_id: portal_user_id || null,
      last_message_at: new Date().toISOString(),
      last_message_preview: '',
      unread_count: 0,
    };
    if (profile.role === 'teacher') {
      insertPayload.assigned_staff_id = profile.id;
    }

    const { data: conv, error } = await admin
      .from('whatsapp_conversations')
      .insert(insertPayload)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: conv }, { status: 201 });
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}

// DELETE /api/inbox/conversation?id=<conversation_id>
// Staff only. Teachers can only delete conversations assigned to them.
// Cascades: deletes all messages first, then the conversation row.
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { data: profile } = await admin
      .from('portal_users')
      .select('id, role')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get('id');
    if (!conversationId) return NextResponse.json({ error: 'id required' }, { status: 400 });

    // Fetch conversation to enforce ownership for teachers
    const { data: conv } = await admin
      .from('whatsapp_conversations')
      .select('id, assigned_staff_id, portal_user_id')
      .eq('id', conversationId)
      .maybeSingle();

    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    if (profile.role === 'teacher' && conv.assigned_staff_id !== profile.id) {
      return NextResponse.json({ error: 'You can only delete conversations assigned to you' }, { status: 403 });
    }

    // Cascade: delete messages then conversation
    await admin.from('whatsapp_messages').delete().eq('conversation_id', conversationId);
    const { error: delErr } = await admin.from('whatsapp_conversations').delete().eq('id', conversationId);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
