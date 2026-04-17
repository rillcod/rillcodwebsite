import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessSchool, getStaffContext } from '@/lib/cards/rbac';
import { notificationsService } from '@/services/notifications.service';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await getStaffContext();
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const body = await request.json();
  const channel = String(body?.channel || '').toLowerCase();
  if (!['email', 'whatsapp'].includes(channel)) {
    return NextResponse.json({ error: 'Invalid channel' }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: card, error } = await (db as any)
    .from('identity_cards')
    .select('*, portal_users!identity_cards_holder_id_fkey(id, full_name, email, phone, school_id)')
    .eq('id', id)
    .single();
  if (error || !card) return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  if (!canAccessSchool(ctx, card.school_id)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/dashboard/card-studio?mode=issuance&type=${card.holder_type}&q=${encodeURIComponent(card.card_number)}`;
  const message = `Hi ${card.portal_users?.full_name || ''}, your ${card.holder_type} access card is ready. Card No: ${card.card_number}. Verify: ${verifyUrl}`;

  let delivery = { channel, sent: false, whatsapp_url: null as string | null };

  if (channel === 'email') {
    const email = card.portal_users?.email as string | undefined;
    if (!email) return NextResponse.json({ error: 'Holder has no email address' }, { status: 400 });
    await notificationsService.sendExternalEmail({
      to: email,
      subject: `Your ${card.holder_type} access card`,
      html: `<p>${message}</p><p>Sent by support@rillcod.com</p>`,
    });
    delivery.sent = true;
  } else {
    const phone = String(card.portal_users?.phone || '').replace(/\s+/g, '');
    const wa = `https://wa.me/${phone.replace(/^\+/, '')}?text=${encodeURIComponent(message)}`;
    delivery = { channel, sent: true, whatsapp_url: wa };
  }

  await (db as any).from('card_audit_logs').insert({
    card_id: card.id,
    actor_id: ctx.id,
    school_id: card.school_id,
    action: `delivery:${channel}`,
    entity: 'identity_card',
    details: delivery,
  });

  return NextResponse.json({ data: delivery });
}

