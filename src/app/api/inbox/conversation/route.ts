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
    if (phone.length < 7 || phone.length > 15) {
      return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 });
    }
    const safeName = String(contact_name || '').trim().slice(0, 100);

    if (portal_user_id) {
      const { data: pu } = await admin
        .from('portal_users')
        .select('id, school_id, is_active, is_deleted')
        .eq('id', portal_user_id)
        .maybeSingle();
      if (!pu || pu.is_active === false || pu.is_deleted === true) {
        return NextResponse.json({ error: 'Invalid or inactive portal_user_id' }, { status: 400 });
      }
      if (profile.role === 'school' || profile.role === 'teacher') {
        const { getTeacherSchoolIds } = await import('@/lib/auth-utils');
        const allowed =
          profile.role === 'teacher'
            ? await getTeacherSchoolIds(profile.id, profile.school_id)
            : profile.school_id
              ? [profile.school_id]
              : [];
        if (!pu.school_id || !allowed.includes(pu.school_id)) {
          return NextResponse.json({ error: 'Forbidden: user belongs to a different school' }, { status: 403 });
        }
      }
    }

    // Find existing conversation by phone number
    const { data: existing } = await admin
      .from('whatsapp_conversations')
      .select('id, phone_number, contact_name, portal_user_id, assigned_staff_id, last_message_at, last_message_preview, unread_count, opted_out')
      .eq('phone_number', phone)
      .maybeSingle();

    if (existing) {
      if (profile.role === 'school' || profile.role === 'teacher') {
        if (existing.portal_user_id) {
          const { data: pu } = await admin
            .from('portal_users')
            .select('school_id')
            .eq('id', existing.portal_user_id)
            .maybeSingle();
          const { getTeacherSchoolIds } = await import('@/lib/auth-utils');
          const allowed =
            profile.role === 'teacher'
              ? await getTeacherSchoolIds(profile.id, profile.school_id)
              : profile.school_id
                ? [profile.school_id]
                : [];
          if (pu?.school_id && !allowed.includes(pu.school_id)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
          }
        } else if (profile.role === 'teacher') {
          // Unlinked conversation: only claim if already assigned to this teacher (or unassigned within own flow).
          // Do not claim orphan global conversations from other campuses.
          if (existing.assigned_staff_id && existing.assigned_staff_id !== profile.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
          }
        }
      }

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
      contact_name: safeName || phone,
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

    if (error) {
      console.error('[inbox/conversation] insert failed:', error.message);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
    return NextResponse.json({ data: conv }, { status: 201 });
  } catch (err: any) {
    const isAuthError = ['Unauthorized', 'Forbidden'].includes(err?.message);
    const safeMessage = isAuthError ? err.message : 'Internal server error';
    const status = isAuthError ? (err.message === 'Unauthorized' ? 401 : 403) : 500;
    return NextResponse.json({ error: safeMessage }, { status });
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
      .select('id, role, school_id')
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

    if (profile.role === 'school') {
      if (conv.portal_user_id) {
        const { data: pu } = await admin
          .from('portal_users')
          .select('school_id')
          .eq('id', conv.portal_user_id)
          .maybeSingle();
        if (!pu || pu.school_id !== profile.school_id) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      }
    }

    // Cascade: delete messages then conversation
    await admin.from('whatsapp_messages').delete().eq('conversation_id', conversationId);
    const { error: delErr } = await admin.from('whatsapp_conversations').delete().eq('id', conversationId);
    if (delErr) {
      console.error('[inbox/conversation] delete failed:', delErr.message);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    const isAuthError = ['Unauthorized', 'Forbidden'].includes(err?.message);
    const safeMessage = isAuthError ? err.message : 'Internal server error';
    const status = isAuthError ? (err.message === 'Unauthorized' ? 401 : 403) : 500;
    return NextResponse.json({ error: safeMessage }, { status });
  }
}
