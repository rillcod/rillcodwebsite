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

export async function PATCH(request: NextRequest) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Only admin and school roles can assign conversations
    if (!['admin', 'school'].includes(caller.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { conversation_id, staff_id } = body;

    if (!conversation_id || typeof conversation_id !== 'string') {
      return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 });
    }

    const admin = createAdminClient() as any;

    // Fetch conversation
    const { data: conv } = await admin
      .from('whatsapp_conversations')
      .select('id, portal_user_id')
      .eq('id', conversation_id)
      .maybeSingle();

    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

    // School role: verify conversation belongs to their school
    if (caller.role === 'school' && conv.portal_user_id) {
      const { data: pu } = await admin
        .from('portal_users')
        .select('school_id')
        .eq('id', conv.portal_user_id)
        .maybeSingle();
      if (!pu || pu.school_id !== caller.school_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Validate staff_id if provided
    if (staff_id) {
      const { data: staff } = await admin
        .from('portal_users')
        .select('id, role')
        .eq('id', staff_id)
        .maybeSingle();
      if (!staff) return NextResponse.json({ error: 'Invalid staff_id' }, { status: 400 });
      if (!['admin', 'teacher', 'school'].includes(staff.role)) {
        return NextResponse.json({ error: 'Target user is not a staff member' }, { status: 400 });
      }
    }

    await admin
      .from('whatsapp_conversations')
      .update({ assigned_staff_id: staff_id || null })
      .eq('id', conversation_id);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[inbox/assign]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
