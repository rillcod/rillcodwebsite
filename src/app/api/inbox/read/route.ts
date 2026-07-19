import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

async function getCaller() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient() as any;
  const { data: profile } = await admin
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  return profile ? { ...profile, userId: user.id } : null;
}

export async function POST(request: NextRequest) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { conversation_id } = body;

    if (!conversation_id || typeof conversation_id !== 'string') {
      return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 });
    }

    const admin = createAdminClient() as any;

    // Fetch conversation to verify access
    const { data: conv } = await admin
      .from('whatsapp_conversations')
      .select('id, portal_user_id, assigned_staff_id')
      .eq('id', conversation_id)
      .maybeSingle();

    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    // Only the assigned staff, admin, or the conversation owner can mark as read
    const isOwner = caller.role === 'parent' || caller.role === 'student';
    const isAdmin = caller.role === 'admin';
    const isAssigned = conv.assigned_staff_id === caller.id;

    if (!isOwner && !isAdmin && !isAssigned) {
      // Allow school/teacher to mark read if the portal_user belongs to their school
      if (caller.role === 'school' || caller.role === 'teacher') {
        if (conv.portal_user_id) {
          const { data: pu } = await admin
            .from('portal_users')
            .select('school_id')
            .eq('id', conv.portal_user_id)
            .maybeSingle();
          if (!pu || pu.school_id !== caller.school_id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
          }
        }
      } else {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    await admin
      .from('whatsapp_conversations')
      .update({ unread_count: 0 })
      .eq('id', conversation_id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[inbox/read]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
