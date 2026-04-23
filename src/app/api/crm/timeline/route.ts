import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Database, Tables } from '@/types/supabase';

function adminClient() {
  return createSupabase<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireCrmStaff() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await adminClient()
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) return null;
  return profile;
}

type TimelineItem = {
  id: string;
  channel: 'crm' | 'whatsapp' | 'inapp';
  type: string;
  direction: 'inbound' | 'outbound' | 'system';
  content: string;
  created_at: string;
  actor?: string;
};

type CrmInteractionRow = Pick<Tables<'crm_interactions'>, 'id' | 'type' | 'direction' | 'content' | 'staff_name' | 'created_at'>;
type WhatsAppMessageRow = Pick<Tables<'whatsapp_messages'>, 'id' | 'direction' | 'body' | 'created_at'>;
type InAppMessageRow = {
  id: string;
  sender_id: string | null;
  recipient_id: string | null;
  message: string | null;
  created_at: string | null;
  sender: { full_name: string | null } | null;
  recipient: { full_name: string | null } | null;
};

export async function GET(req: NextRequest) {
  const caller = await requireCrmStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const admin = adminClient();
  const contactId = new URL(req.url).searchParams.get('contact_id');
  if (!contactId) return NextResponse.json({ error: 'contact_id is required' }, { status: 400 });

  const { data: contact } = await admin
    .from('portal_users')
    .select('id, full_name, phone, school_id')
    .eq('id', contactId)
    .maybeSingle();

  const normalizedPhone = String(contact?.phone ?? '').replace(/\D/g, '');
  const contactSchoolId = contact?.school_id ?? null;
  const scopedSchoolOk = caller.role === 'admin' || !caller.school_id || !contactSchoolId || caller.school_id === contactSchoolId;
  if (!scopedSchoolOk) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [crmRes, waConvRes, inappRes] = await Promise.all([
    admin
      .from('crm_interactions')
      .select('id, type, direction, content, staff_name, created_at')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(200),
    normalizedPhone
      ? admin
          .from('whatsapp_conversations')
          .select('id')
          .eq('phone_number', normalizedPhone)
          .maybeSingle()
      : Promise.resolve({ data: null as { id: string } | null }),
    admin
      .from('messages')
      .select('id, sender_id, recipient_id, message, created_at, sender:portal_users!messages_sender_id_fkey(full_name), recipient:portal_users!messages_recipient_id_fkey(full_name)')
      .or(`sender_id.eq.${contactId},recipient_id.eq.${contactId}`)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  const waConversationId = waConvRes.data?.id ?? undefined;
  const waRes = waConversationId
    ? await admin
        .from('whatsapp_messages')
        .select('id, direction, body, created_at')
        .eq('conversation_id', waConversationId)
        .order('created_at', { ascending: false })
        .limit(200)
    : { data: [] as WhatsAppMessageRow[] };

  const timeline: TimelineItem[] = [];
  for (const i of (crmRes.data ?? []) as CrmInteractionRow[]) {
    timeline.push({
      id: `crm:${i.id}`,
      channel: 'crm',
      type: String(i.type ?? 'note'),
      direction: (String(i.direction ?? 'outbound') as TimelineItem['direction']),
      content: String(i.content ?? ''),
      created_at: String(i.created_at ?? new Date().toISOString()),
      actor: i.staff_name ? String(i.staff_name) : undefined,
    });
  }
  for (const m of (waRes.data ?? []) as WhatsAppMessageRow[]) {
    timeline.push({
      id: `wa:${m.id}`,
      channel: 'whatsapp',
      type: 'whatsapp',
      direction: (String(m.direction ?? 'inbound') as TimelineItem['direction']),
      content: String(m.body ?? ''),
      created_at: String(m.created_at ?? new Date().toISOString()),
    });
  }
  for (const m of (inappRes.data ?? []) as InAppMessageRow[]) {
    const senderId = String(m.sender_id ?? '');
    timeline.push({
      id: `inapp:${m.id}`,
      channel: 'inapp',
      type: 'message',
      direction: senderId === contactId ? 'inbound' : 'outbound',
      content: String(m.message ?? ''),
      created_at: String(m.created_at ?? new Date().toISOString()),
      actor: senderId === contactId
        ? String(m.sender?.full_name ?? contact?.full_name ?? 'Contact')
        : String(m.recipient?.full_name ?? 'Staff'),
    });
  }

  timeline.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return NextResponse.json({ data: timeline.slice(0, 500) });
}
