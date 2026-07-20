import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const STATUS_MAP: Record<string, 'sent' | 'delivered' | 'read' | 'failed' | 'suppressed'> = {
  sent: 'sent', delivered: 'delivered', delivery: 'delivered', opened: 'read', open: 'read', read: 'read',
  bounced: 'failed', bounce: 'failed', failed: 'failed', complained: 'suppressed', complaint: 'suppressed',
  suppressed: 'suppressed',
};

export async function POST(req: NextRequest) {
  const secret = process.env.EMAIL_STATUS_WEBHOOK_SECRET || process.env.INBOUND_EMAIL_WEBHOOK_SECRET || process.env.CRON_SECRET;
  const supplied = req.headers.get('x-webhook-secret') || req.headers.get('x-cron-secret');
  if (!secret || supplied !== secret) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const provider = String(body.provider || (String(body.type || '').startsWith('email.') ? 'resend' : 'sendpulse')).toLowerCase();
  const providerMessageId = String(body.provider_message_id || body.message_id || body.id || body.data?.email_id || body.data?.id || '').trim();
  const rawStatus = String(body.status || body.event || body.type || '').toLowerCase().replace(/^email\./, '');
  const status = STATUS_MAP[rawStatus];
  if (!providerMessageId || !status) return NextResponse.json({ error: 'Provider message id and supported status are required.' }, { status: 400 });

  const now = new Date().toISOString();
  const timestamps: Record<string, string> = {};
  if (status === 'delivered') timestamps.delivered_at = now;
  if (status === 'read') timestamps.read_at = now;
  if (status === 'failed' || status === 'suppressed') timestamps.failed_at = now;
  const db = createAdminClient() as any;
  const { data: delivery, error } = await db.from('communication_delivery_log').update({
    status, ...timestamps, error: status === 'failed' ? String(body.error || body.data?.reason || 'Provider reported failure').slice(0, 4000) : null,
    metadata: body, updated_at: now,
  }).eq('provider', provider).eq('provider_message_id', providerMessageId).select('id,case_event_id').maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!delivery) return NextResponse.json({ success: true, matched: false });
  if (delivery.case_event_id) {
    await db.from('communication_case_events').update({ delivery_status: status, ...timestamps }).eq('id', delivery.case_event_id);
  }
  return NextResponse.json({ success: true, matched: true, status });
}
