import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed' | 'suppressed';

const STATUS_MAP: Record<string, DeliveryStatus> = {
  sent: 'sent',
  queued: 'sent',
  processed: 'sent',
  delivered: 'delivered',
  delivery: 'delivered',
  opened: 'read',
  open: 'read',
  read: 'read',
  clicked: 'read',
  click: 'read',
  bounced: 'failed',
  bounce: 'failed',
  hard_bounces: 'failed',
  soft_bounces: 'failed',
  hard_bounce: 'failed',
  soft_bounce: 'failed',
  not_delivered: 'failed',
  undelivered: 'failed',
  failed: 'failed',
  dropped: 'failed',
  rejected: 'failed',
  complained: 'suppressed',
  complaint: 'suppressed',
  spam: 'suppressed',
  spamreport: 'suppressed',
  suppressed: 'suppressed',
  unsubscribed: 'suppressed',
  unsubscribe: 'suppressed',
};

type NormalizedEvent = {
  provider: string;
  providerMessageId: string;
  status: DeliveryStatus;
  rawStatus: string;
  error?: string | null;
};

function normalizeStatus(raw: string): DeliveryStatus | null {
  const key = String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/^email\./, '')
    .replace(/\s+/g, '_');
  return STATUS_MAP[key] ?? null;
}

function pickMessageId(item: Record<string, any>): string {
  return String(
    item.provider_message_id ||
      item.message_id ||
      item.messageId ||
      item.smtp_message_id ||
      item.id ||
      item.data?.email_id ||
      item.data?.id ||
      item.data?.message_id ||
      '',
  ).trim();
}

function normalizeEvent(item: Record<string, any>, fallbackProvider: string): NormalizedEvent | null {
  const providerMessageId = pickMessageId(item);
  const rawStatus = String(
    item.status || item.event || item.type || item.event_type || item.data?.type || '',
  );
  const status = normalizeStatus(rawStatus);
  if (!providerMessageId || !status) return null;

  const looksResend = fallbackProvider === 'resend' || String(item.type || '').startsWith('email.');
  const provider = String(
    item.provider || (looksResend ? 'resend' : fallbackProvider) || 'sendpulse',
  ).toLowerCase();

  return {
    provider,
    providerMessageId,
    status,
    rawStatus: rawStatus.toLowerCase().replace(/^email\./, ''),
    error: String(item.error || item.reason || item.data?.reason || item.data?.error || '').slice(0, 1000) || null,
  };
}

function extractEvents(body: unknown, fallbackProvider: string): NormalizedEvent[] {
  const rows: unknown[] = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && Array.isArray((body as any).events)
      ? (body as any).events
      : body && typeof body === 'object' && Array.isArray((body as any).data)
        ? (body as any).data
        : body
          ? [body]
          : [];

  return rows
    .map((row) => (row && typeof row === 'object' ? normalizeEvent(row as Record<string, any>, fallbackProvider) : null))
    .filter((row): row is NormalizedEvent => Boolean(row));
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function verifySharedSecret(req: NextRequest, rawBody: string): boolean {
  const secret =
    process.env.EMAIL_STATUS_WEBHOOK_SECRET ||
    process.env.INBOUND_EMAIL_WEBHOOK_SECRET ||
    process.env.CRON_SECRET;
  if (!secret) return false;

  const headerSecret = req.headers.get('x-webhook-secret') || req.headers.get('x-cron-secret') || '';
  if (headerSecret && timingSafeStringEqual(headerSecret, secret)) return true;

  const urlToken = req.nextUrl.searchParams.get('token') || req.nextUrl.searchParams.get('secret') || '';
  if (urlToken && timingSafeStringEqual(urlToken, secret)) return true;

  // Some providers put the secret in Authorization: Bearer <secret>
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (bearer && timingSafeStringEqual(bearer, secret)) return true;

  // Optional body field for bridge scripts
  try {
    const parsed = JSON.parse(rawBody);
    const bodySecret = String(parsed?.webhook_secret || parsed?.secret || '').trim();
    if (bodySecret && timingSafeStringEqual(bodySecret, secret)) return true;
  } catch {
    // ignore
  }

  return false;
}

/** Resend/Svix signature verification when RESEND_WEBHOOK_SECRET is set. */
function verifyResendSvix(req: NextRequest, rawBody: string): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return false;
  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const secretBytes = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64')
    : Buffer.from(secret, 'utf8');
  const expected = createHmac('sha256', secretBytes).update(signedContent).digest('base64');

  return svixSignature.split(' ').some((part) => {
    const [, sig] = part.split(',');
    return sig ? timingSafeStringEqual(sig, expected) : false;
  });
}

async function applyEvent(db: any, event: NormalizedEvent) {
  const now = new Date().toISOString();
  const timestamps: Record<string, string> = {};
  if (event.status === 'delivered') timestamps.delivered_at = now;
  if (event.status === 'read') timestamps.read_at = now;
  if (event.status === 'failed' || event.status === 'suppressed') timestamps.failed_at = now;

  // Prefer exact provider+id, then fall back to message id alone (provider naming varies).
  let existing: any = null;
  const { data: byProvider } = await db
    .from('communication_delivery_log')
    .select('id,case_id,case_event_id,metadata,provider')
    .eq('provider', event.provider)
    .eq('provider_message_id', event.providerMessageId)
    .maybeSingle();
  existing = byProvider;
  if (!existing) {
    const { data: byId } = await db
      .from('communication_delivery_log')
      .select('id,case_id,case_event_id,metadata,provider')
      .eq('provider_message_id', event.providerMessageId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    existing = byId;
  }
  if (!existing) return { matched: false as const };

  const { data: delivery, error } = await db
    .from('communication_delivery_log')
    .update({
      status: event.status,
      ...timestamps,
      error:
        event.status === 'failed'
          ? String(event.error || 'Provider reported failure').slice(0, 4000)
          : null,
      metadata: {
        ...(existing.metadata || {}),
        provider_event: event.rawStatus,
        provider_event_at: now,
        provider_reason: event.error,
        webhook_provider: event.provider,
      },
      updated_at: now,
    })
    .eq('id', existing.id)
    .select('id,case_id,case_event_id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!delivery) return { matched: false as const };

  let caseEventId = delivery.case_event_id as string | null;
  if (!caseEventId && delivery.case_id) {
    // Prefer event already tagged with this provider message id, else latest outbound email event.
    const { data: byMsg } = await db
      .from('communication_case_events')
      .select('id')
      .eq('case_id', delivery.case_id)
      .eq('provider_message_id', event.providerMessageId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    caseEventId = byMsg?.id ?? null;
    if (!caseEventId) {
      const { data: latestOutbound } = await db
        .from('communication_case_events')
        .select('id')
        .eq('case_id', delivery.case_id)
        .eq('channel', 'email')
        .eq('direction', 'outbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      caseEventId = latestOutbound?.id ?? null;
    }
    if (caseEventId) {
      await db
        .from('communication_delivery_log')
        .update({ case_event_id: caseEventId, updated_at: now })
        .eq('id', delivery.id);
    }
  }

  if (caseEventId) {
    await db
      .from('communication_case_events')
      .update({
        delivery_status: event.status,
        provider: event.provider,
        provider_message_id: event.providerMessageId,
        ...timestamps,
      })
      .eq('id', caseEventId);
  }

  return { matched: true as const, status: event.status };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const authorized = verifySharedSecret(req, rawBody) || verifyResendSvix(req, rawBody);
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const fallbackProvider = verifyResendSvix(req, rawBody)
    ? 'resend'
    : String((body as any)?.provider || ((body as any)?.type || '').startsWith?.('email.') ? 'resend' : 'sendpulse').toLowerCase();

  const events = extractEvents(body, fallbackProvider);
  if (!events.length) {
    return NextResponse.json(
      { error: 'Provider message id and supported status are required.' },
      { status: 400 },
    );
  }

  const db = createAdminClient() as any;
  const results: Array<{ providerMessageId: string; matched: boolean; status?: DeliveryStatus }> = [];

  try {
    for (const event of events) {
      const result = await applyEvent(db, event);
      results.push({
        providerMessageId: event.providerMessageId,
        matched: result.matched,
        status: result.matched ? result.status : undefined,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook processing failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const matched = results.filter((row) => row.matched).length;
  return NextResponse.json({
    success: true,
    matched: matched > 0,
    processed: results.length,
    matchedCount: matched,
    results,
  });
}
