import { NextRequest, NextResponse } from 'next/server';
import type { Tables } from '@/types/supabase';
import { requireCrmStaffOrNull } from '@/lib/crm/auth';
import { assertCrmContactAccess } from '@/lib/crm/scope';

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
  const session = await requireCrmStaffOrNull();
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { caller, db: admin } = session;
  const contactId = new URL(req.url).searchParams.get('contact_id');
  if (!contactId) return NextResponse.json({ error: 'contact_id is required' }, { status: 400 });

  const access = await assertCrmContactAccess(admin, caller, contactId);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const contact = access.kind === 'portal'
    ? { id: access.row.id, full_name: access.row.full_name, phone: access.row.phone, school_id: access.row.school_id }
    : access.kind === 'book'
      ? { id: access.row.id, full_name: access.row.full_name, phone: access.row.phone, school_id: access.schoolId }
      : { id: access.row.id, full_name: access.row.contact_name, phone: access.row.phone_number, school_id: null };

  const normalizedPhone = String(contact?.phone ?? '').replace(/\D/g, '');
  const phoneTail = normalizedPhone.length >= 10 ? normalizedPhone.slice(-10) : normalizedPhone;

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
          .select('id, phone_number')
          .or(
            phoneTail && phoneTail !== normalizedPhone
              ? `phone_number.eq.${normalizedPhone},phone_number.ilike.%${phoneTail}`
              : `phone_number.eq.${normalizedPhone},phone_number.ilike.%${normalizedPhone}`,
          )
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null as { id: string } | null }),
    access.kind === 'portal'
      ? admin
          .from('messages')
          .select('id, sender_id, recipient_id, message, created_at, sender:portal_users!messages_sender_id_fkey(full_name), recipient:portal_users!messages_recipient_id_fkey(full_name)')
          .or(`sender_id.eq.${contactId},recipient_id.eq.${contactId}`)
          .order('created_at', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as InAppMessageRow[] }),
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
  const items = timeline.slice(0, 500);
  return NextResponse.json({ data: items, timeline: items });
}
