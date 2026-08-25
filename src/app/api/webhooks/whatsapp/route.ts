import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'crypto';
import { sendWhatsAppDetailed } from '@/lib/whatsapp/send';
import { loadDutyCapacity } from '@/lib/communication/duty-assignment';
import { recordCommunicationCaseEvent } from '@/lib/communication/cases';
import {
  recordCommunicationDeliveryEvent,
  recordUnmatchedDeliveryEvent,
  type CommunicationDeliveryStatus,
} from '@/lib/communication/delivery-ledger';

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
      console.error('[WhatsApp Webhook] WHATSAPP_APP_SECRET not set - unsigned webhook rejected');
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
        .select('id, contact_name, phone_number, unread_count, portal_user_id, opted_out, assigned_staff_id')
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

      if (!isOptOut && !isOptIn) {
        try {
          await trackInboundWork(admin, conversation, messageBody, messageId);
        } catch (trackingError) {
          console.error('[WhatsApp Webhook] Work assignment failed:', trackingError);
        }
      }

      if (isOptOut && !conversation.opted_out) {
        await admin.from('whatsapp_conversations').update({
          opted_out: true,
          opted_out_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', conversation.id);
        await admin.from('marketing_suppressions').upsert({
          portal_user_id: conversation.portal_user_id || null,
          identity_type: conversation.portal_user_id ? 'portal_user' : 'phone',
          identity_value: conversation.portal_user_id || from,
          channel: 'whatsapp',
          reason: 'Customer sent STOP on WhatsApp',
          source: 'whatsapp_command',
        }, { onConflict: 'identity_type,identity_value,channel' });
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
        await admin.from('marketing_suppressions').delete()
          .eq('channel', 'whatsapp')
          .or(conversation.portal_user_id
            ? `and(identity_type.eq.portal_user,identity_value.eq.${conversation.portal_user_id}),and(identity_type.eq.phone,identity_value.eq.${from})`
            : `and(identity_type.eq.phone,identity_value.eq.${from})`);
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
      const now = new Date().toISOString();
      const mappedStatus = (['sent','delivered','read','failed'].includes(newStatus) ? newStatus : 'sent') as CommunicationDeliveryStatus;
      const errorText = newStatus === 'failed' ? JSON.stringify(status.errors ?? []) : null;
      const { data: deliveryRows } = await admin.from('communication_delivery_log')
        .select('id,case_id,case_event_id,status')
        .eq('provider', 'meta').eq('provider_message_id', messageId);

      let canonicalStatus = mappedStatus;
      if (!deliveryRows?.length) {
        await recordUnmatchedDeliveryEvent(admin, {
          eventKey: `meta:${messageId}:${newStatus}`,
          status: mappedStatus,
          channel: 'whatsapp',
          provider: 'meta',
          providerMessageId: messageId,
          providerStatus: newStatus,
          occurredAt: now,
          error: errorText,
          metadata: { errors: status.errors ?? [], unmatched: true },
        });
      }

      for (const delivery of deliveryRows ?? []) {
        const recorded = await recordCommunicationDeliveryEvent(admin, {
          deliveryId: delivery.id,
          eventKey: `meta:${messageId}:${newStatus}`,
          status: mappedStatus,
          channel: 'whatsapp',
          provider: 'meta',
          providerMessageId: messageId,
          providerStatus: newStatus,
          occurredAt: now,
          error: errorText,
          metadata: { errors: status.errors ?? [] },
        });
        canonicalStatus = (recorded?.current_status ?? mappedStatus) as CommunicationDeliveryStatus;
        let caseEventId = delivery.case_event_id as string | null;
        if (!caseEventId && delivery.case_id) {
          const { data: byMsg } = await admin
            .from('communication_case_events')
            .select('id')
            .eq('case_id', delivery.case_id)
            .eq('provider_message_id', messageId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          caseEventId = byMsg?.id ?? null;
          if (!caseEventId) {
            const { data: latest } = await admin
              .from('communication_case_events')
              .select('id')
              .eq('case_id', delivery.case_id)
              .eq('channel', 'whatsapp')
              .eq('direction', 'outbound')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            caseEventId = latest?.id ?? null;
          }
          if (caseEventId) {
            await admin.from('communication_delivery_log').update({ case_event_id: caseEventId }).eq('id', delivery.id);
          }
        }
        if (caseEventId) {
          const deliveryTimes: Record<string, string> = {};
          if (canonicalStatus === 'delivered' || canonicalStatus === 'read') deliveryTimes.delivered_at = now;
          if (canonicalStatus === 'read') deliveryTimes.read_at = now;
          if (canonicalStatus === 'failed') deliveryTimes.failed_at = now;
          await admin.from('communication_case_events').update({
            delivery_status: canonicalStatus,
            provider: 'meta',
            provider_message_id: messageId,
            ...deliveryTimes,
          }).eq('id', caseEventId);
        }
      }

      // Keep operational mirrors aligned to the canonical monotonic state.
      await admin.from('whatsapp_messages').update({ status: canonicalStatus, updated_at: now })
        .filter('metadata->>whatsapp_message_id', 'eq', messageId);
      await admin.from('whatsapp_messages').update({ status: canonicalStatus, updated_at: now })
        .eq('meta_message_id', messageId);
      await admin.from('whatsapp_outbox').update({
        status: canonicalStatus,
        last_error: canonicalStatus === 'failed' ? errorText : null,
        updated_at: now,
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

  const delivery = await sendWhatsAppDetailed({ to: phone, message: body, persistToInbox: false });
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
async function trackInboundWork(admin: any, conversation: any, messageBody: string, messageId: string) {
  const now = new Date();
  const isComplaint = /complain|complaint|unhappy|disappoint|bad|poor|terrible|refund|fraud/i.test(messageBody);
  let assignedStaffId = conversation.assigned_staff_id ?? null;
  let targetSchoolId: string | null = null;
  let classOwnerId: string | null = null;

  let requesterProfile: any = null;
  if (conversation.portal_user_id) {
    const { data: profile } = await admin.from('portal_users')
      .select('full_name, email, phone, school_id, primary_teacher_id, class_id')
      .eq('id', conversation.portal_user_id)
      .maybeSingle();
    targetSchoolId = profile?.school_id ?? null;
    classOwnerId = profile?.primary_teacher_id ?? null;
    requesterProfile = profile;
    if (!classOwnerId && profile?.class_id) {
      const { data: cls } = await admin.from('classes').select('teacher_id').eq('id', profile.class_id).maybeSingle();
      classOwnerId = cls?.teacher_id ?? null;
    }
  }

  if (!assignedStaffId) {
    const snapshot = await loadDutyCapacity(admin, { targetSchoolId, classOwnerId, requiredSkill: isComplaint ? null : 'customer_care', restrictedToAdmin: isComplaint });
    assignedStaffId = snapshot.selected?.id ?? null;
    if (assignedStaffId) {
      await admin.from('whatsapp_conversations').update({ assigned_staff_id: assignedStaffId, updated_at: now.toISOString() }).eq('id', conversation.id);
    }
  }

  const responseHours = isComplaint ? 2 : 4;
  const { error } = await admin.from('communication_conversation_meta').upsert({
    conversation_id: conversation.id,
    priority: isComplaint ? 'high' : 'medium',
    status: 'open',
    last_inbound_at: now.toISOString(),
    sla_due_at: new Date(now.getTime() + responseHours * 60 * 60 * 1000).toISOString(),
    reminder_count: 0,
    last_reminder_at: null,
    escalated_at: null,
    updated_at: now.toISOString(),
  }, { onConflict: 'conversation_id' });
  if (error) console.error('[WhatsApp Webhook] Unable to start follow-up clock:', error.message);
  await recordCommunicationCaseEvent(admin, {
    requesterId: conversation.portal_user_id ?? null,
    requesterName: requesterProfile?.full_name ?? conversation.contact_name ?? null,
    requesterEmail: requesterProfile?.email ?? null,
    requesterPhone: requesterProfile?.phone ?? conversation.phone_number ?? null,
    schoolId: targetSchoolId,
    classOwnerId,
    assignedTo: assignedStaffId,
    subject: isComplaint ? 'WhatsApp complaint' : 'WhatsApp support request',
    body: messageBody,
    category: isComplaint ? 'complaint' : 'general',
    channel: 'whatsapp',
    direction: 'inbound',
    sourceType: 'whatsapp_message',
    provider: 'meta',
    providerMessageId: messageId,
    sourceId: messageId,
    restrictedToAdmin: isComplaint,
  });
}
