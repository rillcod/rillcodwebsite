import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';
import { sendWhatsAppDetailed } from '@/lib/whatsapp/send';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export const dynamic = 'force-dynamic';

/** Normalize a raw phone string to E.164 digits only (no +).
 *  Nigerian numbers starting with 0 get country code 234 prepended. */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) return '234' + digits.slice(1);
  return digits;
}

// GET /api/webhooks/whatsapp — Webhook verification (Meta requirement)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!VERIFY_TOKEN) {
    console.error('[WhatsApp Webhook] WHATSAPP_WEBHOOK_VERIFY_TOKEN env var not set');
    return NextResponse.json({ error: 'Webhook misconfigured' }, { status: 500 });
  }

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WhatsApp Webhook] Verification successful');
    return new NextResponse(challenge, { status: 200 });
  }

  console.error('[WhatsApp Webhook] Verification failed');
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// POST /api/webhooks/whatsapp — Receive incoming WhatsApp messages
export async function POST(req: NextRequest) {
  try {
    // ── HMAC-SHA256 signature verification ──────────────────────────────────
    const APP_SECRET = process.env.WHATSAPP_APP_SECRET;
    if (APP_SECRET) {
      const signature = req.headers.get('x-hub-signature-256') ?? '';
      const rawBody = await req.text();
      const expectedSig = 'sha256=' + createHmac('sha256', APP_SECRET).update(rawBody).digest('hex');
      let sigValid = false;
      try {
        sigValid = signature.length > 0 &&
          timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
      } catch { sigValid = false; }
      if (!sigValid) {
        console.error('[WhatsApp Webhook] Invalid signature — request rejected');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
      }
      // Re-parse from already-read text
      const body = JSON.parse(rawBody);
      return handleWebhookBody(body);
    } else {
      console.error('[WhatsApp Webhook] WHATSAPP_APP_SECRET not set - webhook disabled');
      return NextResponse.json({ error: 'Webhook signature verification is not configured' }, { status: 503 });
    }
  } catch (error: any) {
    console.error('[WhatsApp Webhook] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function handleWebhookBody(body: any): Promise<NextResponse> {
  const admin = adminClient();
  const INTERNAL_SECRET = process.env.CRON_SECRET ?? '';

  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;

  if (!value) {
    return NextResponse.json({ success: true, message: 'No value in webhook' });
  }

  // ── Incoming messages ────────────────────────────────────────────────────
  if (value.messages) {
    for (const message of value.messages) {
      const rawPhone = message.from as string;
      const from = normalizePhone(rawPhone);
      const messageId = message.id as string;
      const timestamp = message.timestamp as string;
      const messageType = message.type as string;

      // ── Extract body ────────────────────────────────────────────────────
      let messageBody = '';
      if (messageType === 'text') {
        messageBody = message.text?.body || '';
      } else if (messageType === 'image') {
        messageBody = `[Image] ${message.image?.caption || 'Image received'}`;
      } else if (messageType === 'document') {
        messageBody = `[Document] ${message.document?.filename || 'Document received'}`;
      } else if (messageType === 'audio') {
        messageBody = '[Audio message]';
      } else if (messageType === 'video') {
        messageBody = `[Video] ${message.video?.caption || 'Video received'}`;
      } else {
        messageBody = `[${messageType}] Unsupported message type`;
      }

      // ── Idempotency: skip if this WhatsApp message ID was already saved ─
      const { data: existingMsg } = await admin
        .from('whatsapp_messages')
        .select('id')
        .eq('metadata->>whatsapp_message_id', messageId)
        .maybeSingle();
      if (existingMsg) {
        console.log(`[WhatsApp Webhook] Duplicate message ${messageId} — skipped`);
        continue;
      }

      // ── Get or create conversation ──────────────────────────────────────
      let { data: conversation } = await admin
        .from('whatsapp_conversations')
        .select('id, contact_name, unread_count, portal_user_id, opted_out')
        .eq('phone_number', from)
        .maybeSingle();

      if (!conversation) {
        const { data: user } = await admin
          .from('portal_users')
          .select('id')
          .ilike('phone', `%${from.slice(-10)}%`)
          .limit(1)
          .maybeSingle();

        const { data: newConv, error: convErr } = await admin
          .from('whatsapp_conversations')
          .insert({
            phone_number: from,
            portal_user_id: user?.id || null,
            contact_name: value.contacts?.[0]?.profile?.name || null,
            last_message_at: new Date(parseInt(timestamp) * 1000).toISOString(),
            last_message_preview: messageBody.slice(0, 100),
            unread_count: 1,
            created_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (convErr) {
          console.error('[WhatsApp Webhook] Failed to create conversation:', convErr);
          continue;
        }
        conversation = newConv;
      } else {
        // Try to link to a portal user if not yet linked
        if (!conversation.portal_user_id) {
          const { data: user } = await admin
            .from('portal_users')
            .select('id')
            .ilike('phone', `%${from.slice(-10)}%`)
            .limit(1)
            .maybeSingle();
          if (user) {
            await admin.from('whatsapp_conversations')
              .update({ portal_user_id: user.id })
              .eq('id', conversation.id);
          }
        }

        await admin
          .from('whatsapp_conversations')
          .update({
            last_message_at: new Date(parseInt(timestamp) * 1000).toISOString(),
            last_message_preview: messageBody.slice(0, 100),
            unread_count: (conversation.unread_count ?? 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversation.id);
      }

      if (!conversation) continue;

      // ── Save message ────────────────────────────────────────────────────
      const { error: msgErr } = await admin
        .from('whatsapp_messages')
        .insert({
          conversation_id: conversation.id,
          direction: 'inbound',
          body: messageBody,
          status: 'received',
          metadata: {
            whatsapp_message_id: messageId,
            message_type: messageType,
            timestamp: parseInt(timestamp),
          },
          created_at: new Date(parseInt(timestamp) * 1000).toISOString(),
        });

      if (msgErr) {
        console.error('[WhatsApp Webhook] Failed to save message:', msgErr);
        continue;
      }

      // ── Opt-out / opt-in commands (inline — no HTTP round-trip) ─────────
      const lowerBody = messageBody.toLowerCase().trim();
      const isOptOut = lowerBody === 'stop' || lowerBody === 'unsubscribe' || lowerBody === 'opt out';
      const isOptIn  = lowerBody === 'start' || lowerBody === 'subscribe' || lowerBody === 'opt in';

      if (isOptOut && !conversation.opted_out) {
        await admin.from('whatsapp_conversations').update({
          opted_out: true,
          opted_out_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', conversation.id);
        if (conversation.portal_user_id) {
          await admin.from('portal_users')
            .update({ whatsapp_opt_in: false, updated_at: new Date().toISOString() })
            .eq('id', conversation.portal_user_id);
        }
        await sendOptConfirmation(admin, conversation.id, from, 'out');
      } else if (isOptIn) {
        await admin.from('whatsapp_conversations').update({
          opted_out: false,
          opted_in_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', conversation.id);
        if (conversation.portal_user_id) {
          await admin.from('portal_users')
            .update({ whatsapp_opt_in: true, updated_at: new Date().toISOString() })
            .eq('id', conversation.portal_user_id);
        }
        await sendOptConfirmation(admin, conversation.id, from, 'in');
      } else if (!conversation.opted_out) {
        // ── Auto-respond (only when not opted-out, not a command) ──────────
        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (INTERNAL_SECRET) headers['x-internal-secret'] = INTERNAL_SECRET;
          await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/inbox/auto-respond`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              message: messageBody,
              conversation_id: conversation.id,
              phone_number: from,
            }),
          });
        } catch (autoResErr) {
          console.error('[WhatsApp Webhook] Auto-response trigger failed:', autoResErr);
        }
      }

      console.log(`[WhatsApp Webhook] Message from ${from}: ${messageBody.slice(0, 50)}`);
    }
  }

  // ── Message status updates (sent → delivered → read → failed) ───────────
  if (value.statuses) {
    for (const status of value.statuses) {
      const messageId: string = status.id;
      const newStatus: string = status.status;

      await admin
        .from('whatsapp_messages')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .filter('metadata->>whatsapp_message_id', 'eq', messageId);

      await admin.from('whatsapp_outbox').update({
        status: ['sent','delivered','read','failed'].includes(newStatus) ? newStatus : 'sent',
        last_error: newStatus === 'failed' ? JSON.stringify(status.errors ?? []) : null,
        updated_at: new Date().toISOString(),
      }).eq('meta_message_id', messageId);
    }
  }

  return NextResponse.json({ success: true });
}

/** Send opt-out or opt-in confirmation via WhatsApp API and save to DB. */
async function sendOptConfirmation(
  admin: ReturnType<typeof adminClient>,
  conversationId: string,
  phone: string,
  direction: 'in' | 'out',
) {
  const body = direction === 'out'
    ? `✅ You have been unsubscribed from Rillcod Technologies WhatsApp notifications.\n\nYou will no longer receive automated messages from us.\n\nTo opt back in, reply "START" or visit your dashboard settings.\n\nThank you for using Rillcod Technologies.`
    : `🎉 Welcome back to Rillcod Technologies WhatsApp notifications!\n\nYou will now receive:\n✅ Important updates\n✅ Assignment reminders\n✅ Payment confirmations\n✅ Support responses\n\nTo unsubscribe anytime, reply "STOP"\n\nThank you for choosing Rillcod Technologies!`;

  let status = 'pending';
  let waMessageId: string | null = null;

  const delivery = await sendWhatsAppDetailed({ to: phone, message: body });
  if (delivery.success) { status = 'sent'; waMessageId = delivery.messageId ?? null; }
  else console.error('[WhatsApp Webhook] Opt confirmation send failed:', delivery.error || delivery.reason);

  await admin.from('whatsapp_messages').insert({
    conversation_id: conversationId,
    direction: 'outbound',
    body,
    status,
    metadata: {
      auto_response: true,
      [`opt_${direction}_confirmation`]: true,
      whatsapp_message_id: waMessageId,
    },
    created_at: new Date().toISOString(),
  });

  await admin.from('whatsapp_conversations').update({
    last_message_at: new Date().toISOString(),
    last_message_preview: body.slice(0, 100),
    updated_at: new Date().toISOString(),
  }).eq('id', conversationId);
}
