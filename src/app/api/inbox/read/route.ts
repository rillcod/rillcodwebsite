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

    // Viewing alone must not clear another staff member's queue state.
    const isOwner = (caller.role === 'parent' || caller.role === 'student') && conv.portal_user_id === caller.id;
    const canMarkRead = isOwner || caller.role === 'admin' || conv.assigned_staff_id === caller.id;
    if (!canMarkRead) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
