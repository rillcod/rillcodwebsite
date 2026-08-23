import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { rateLimitproxy } from '@/proxies/rateLimit.proxy';

async function callerProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient() as any;
  const { data } = await admin.from('portal_users').select('id, role, school_id').eq('id', user.id).single();
  return data && ['admin', 'teacher', 'school'].includes(data.role) ? data : null;
}

function cleanPhone(value: unknown) {
  const phone = String(value ?? '').replace(/\D/g, '');
  return phone.length >= 7 && phone.length <= 15 ? phone : null;
}

async function scopedExternal(admin: any, caller: any, conversationId: string) {
  let query = admin.from('whatsapp_conversations')
    .select('id, portal_user_id, assigned_staff_id').eq('id', conversationId).is('portal_user_id', null);
  if (caller.role !== 'admin') query = query.eq('assigned_staff_id', caller.id);
  const { data } = await query.maybeSingle();
  return data;
}

export async function POST(request: NextRequest) {
  try {
    const caller = await callerProfile();
    if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const limited = await rateLimitproxy(request, caller.id);
    if (limited) return limited;
    const body = await request.json();
    const phone = cleanPhone(body.phone);
    const name = String(body.full_name ?? '').trim().slice(0, 100);
    if (!phone || !name) return NextResponse.json({ error: 'Valid name and phone are required' }, { status: 400 });
    const admin = createAdminClient() as any;
    const { data, error } = await admin.from('whatsapp_conversations').insert({
      contact_name: name, phone_number: phone, portal_user_id: null,
      assigned_staff_id: caller.id, last_message_at: new Date().toISOString(),
      last_message_preview: '', unread_count: 0,
    }).select('id, contact_name, phone_number, assigned_staff_id, opted_out').single();
    if (error) {
      console.error('[inbox/contact POST]', error.message);
      return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error('[inbox/contact POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const caller = await callerProfile();
    if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const limited = await rateLimitproxy(request, caller.id);
    if (limited) return limited;
    const body = await request.json();
    const admin = createAdminClient() as any;
    const name = body.full_name === undefined ? undefined : String(body.full_name).trim().slice(0, 100);
    const phone = body.phone === undefined ? undefined : cleanPhone(body.phone);
    if (body.phone !== undefined && !phone) return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });

    if (body.conversation_id) {
      const conv = await scopedExternal(admin, caller, String(body.conversation_id));
      if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      const updates: Record<string, string> = {};
      if (name !== undefined) updates.contact_name = name;
      if (phone) updates.phone_number = phone;
      const { error } = await admin.from('whatsapp_conversations').update(updates).eq('id', conv.id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    const targetId = String(body.id ?? '');
    const { data: target } = await admin.from('portal_users')
      .select('id, school_id').eq('id', targetId).maybeSingle();
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (caller.role !== 'admin' && target.school_id !== caller.school_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const updates: Record<string, string> = {};
    if (name !== undefined) updates.full_name = name;
    if (phone) updates.phone = phone;
    if (body.school_name !== undefined) updates.school_name = String(body.school_name).trim().slice(0, 100);
    const { error } = await admin.from('portal_users').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', targetId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[inbox/contact PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
