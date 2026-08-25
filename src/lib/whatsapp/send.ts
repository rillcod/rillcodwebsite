import { createAdminClient } from '@/lib/supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { recordDeadLetter } from '@/lib/operations/dead-letter';
import { recordCommunicationDeliveryEvent, type CommunicationDeliveryStatus } from '@/lib/communication/delivery-ledger';
import { canSendWhatsAppApiTo, getWhatsAppCloudApiMode, isWhatsAppCloudApiApproved, WHATSAPP_APPROVAL_PENDING_MESSAGE, WHATSAPP_REVIEW_RECIPIENT_MESSAGE } from './approval';

export function normalisePhone(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('234')) return digits;
  if (digits.startsWith('0') && digits.length === 11) return `234${digits.slice(1)}`;
  if (digits.length === 10) return `234${digits}`;
  return digits;
}

export type WhatsAppSendInput = {
  to: string;
  message?: string;
  templateName?: string | null;
  templateLanguage?: string;
  templateVariables?: string[];
  /**
   * Persist successful sends in the inbox unless the caller owns the canonical insert.
   */
  persistToInbox?: boolean;
  caseId?: string | null;
  caseEventId?: string | null;
  automated?: boolean;
  metadata?: Record<string, unknown>;
  recipientUserId?: string | null;
  schoolId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  idempotencyKey?: string | null;
  deliveryLogId?: string | null;
  outboxId?: string | null;
  attemptNumber?: number;
};

export type WhatsAppSendResult = {
  success: boolean;
  messageId?: string;
  reason?: 'approval_pending' | 'review_recipient_blocked' | 'credentials_missing' | 'invalid_phone' | 'invalid_payload' | 'rate_limit' | 'not_whatsapp_user' | 'api_error' | 'network_error';
  error?: string;
  errorCode?: number;
  retryable: boolean;
  deliveryLogId?: string | null;
  ledgerRecorded?: boolean;
};

function config() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID;
  const version = process.env.WHATSAPP_API_VERSION ?? 'v21.0';
  return {
    url: process.env.WHATSAPP_API_URL || (phoneNumberId ? `https://graph.facebook.com/${version}/${phoneNumberId}/messages` : ''),
    token: process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_API_TOKEN || '',
  };
}

function deliveryStatusForResult(result: WhatsAppSendResult): 'sent' | 'failed' | 'suppressed' {
  if (result.success) return 'sent';
  if (result.reason === 'approval_pending' || result.reason === 'review_recipient_blocked') return 'suppressed';
  return 'failed';
}

async function recordWhatsAppDeliveryAttempt(
  input: WhatsAppSendInput,
  result: WhatsAppSendResult,
  extras?: { status?: CommunicationDeliveryStatus; metadata?: Record<string, unknown> },
): Promise<string | null> {
  try {
    const sb = createAdminClient() as any;
    const phone = normalisePhone(input.to);
    const status = extras?.status ?? deliveryStatusForResult(result);
    const now = new Date().toISOString();
    let deliveryLogId = input.deliveryLogId ?? null;
    if (!deliveryLogId) {
      const row = {
        channel: 'whatsapp',
        case_id: input.caseId ?? null,
        case_event_id: input.caseEventId ?? null,
        recipient: phone || input.to || null,
        recipient_user_id: input.recipientUserId ?? null,
        school_id: input.schoolId ?? null,
        source_type: input.sourceType ?? null,
        source_id: input.sourceId ?? null,
        outbox_id: input.outboxId ?? null,
        idempotency_key: input.idempotencyKey ?? null,
        provider: 'meta',
        provider_message_id: result.messageId || null,
        status,
        automated: input.automated !== false,
        template_key: input.templateName || null,
        error: result.success ? null : String(result.error || result.reason || '').slice(0, 4000),
        metadata: { ...(input.metadata ?? {}) },
        queued_at: status === 'queued' ? now : null,
        sent_at: status === 'sent' ? now : null,
        failed_at: status === 'failed' ? now : null,
        updated_at: now,
      };
      const { data, error } = await sb.from('communication_delivery_log').insert(row).select('id').maybeSingle();
      if (error) {
        if (error.code === '23505') {
          let existing = sb.from('communication_delivery_log').select('id');
          existing = input.idempotencyKey
            ? existing.eq('channel', 'whatsapp').eq('idempotency_key', input.idempotencyKey)
            : existing.eq('provider', 'meta').eq('provider_message_id', result.messageId);
          const { data: existingRow } = await existing.maybeSingle();
          deliveryLogId = existingRow?.id ?? null;
        } else {
          console.error('[whatsapp] unable to record delivery:', error);
          return null;
        }
      } else {
        deliveryLogId = data?.id ?? null;
      }
    }
    if (!deliveryLogId) return null;
    const eventMetadata = {
      reason: result.reason ?? null,
      retryable: result.retryable,
      attempt_number: input.attemptNumber ?? undefined,
      ...(input.metadata ?? {}),
      ...(extras?.metadata ?? {}),
    };
    const eventKey = result.messageId
      ? `meta:${result.messageId}:${status}`
      : `${deliveryLogId}:${status}:${input.attemptNumber ?? randomUUID()}`;
    await recordCommunicationDeliveryEvent(sb, {
      deliveryId: deliveryLogId,
      eventKey,
      status,
      channel: 'whatsapp',
      provider: 'meta',
      providerMessageId: result.messageId ?? null,
      providerStatus: result.reason ?? status,
      occurredAt: now,
      error: result.success ? null : result.error || result.reason || null,
      metadata: eventMetadata,
    });
    return deliveryLogId;
  } catch (error) {
    console.error('[whatsapp] unable to record delivery:', error);
    return null;
  }
}

async function dispatchWhatsAppMessage(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
  if (!canSendWhatsAppApiTo(input.to)) {
    const reviewMode = getWhatsAppCloudApiMode() === 'review';
    return { success: false, reason: reviewMode ? 'review_recipient_blocked' : 'approval_pending',
      error: reviewMode ? WHATSAPP_REVIEW_RECIPIENT_MESSAGE : WHATSAPP_APPROVAL_PENDING_MESSAGE, retryable: true };
  }
  const { url, token } = config();
  if (!url || !token) return { success: false, reason: 'credentials_missing', error: 'WhatsApp API credentials are not configured', retryable: true };
  try {
    const endpoint = new URL(url);
    if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'graph.facebook.com') {
      console.error('[whatsapp] Refusing non-Meta API endpoint:', endpoint.hostname);
      return { success: false, reason: 'credentials_missing', error: 'Invalid WhatsApp API endpoint configuration', retryable: false };
    }
  } catch {
    return { success: false, reason: 'credentials_missing', error: 'Invalid WhatsApp API endpoint configuration', retryable: false };
  }
  const to = normalisePhone(input.to);
  if (to.length < 10) return { success: false, reason: 'invalid_phone', error: 'Invalid WhatsApp phone number', retryable: false };
  if (!input.templateName && !input.message?.trim()) return { success: false, reason: 'invalid_payload', error: 'Message or template is required', retryable: false };

  const payload = input.templateName ? {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: input.templateName,
      language: { code: input.templateLanguage || 'en' },
      components: (input.templateVariables ?? []).length ? [{
        type: 'body',
        parameters: (input.templateVariables ?? []).map((text) => ({ type: 'text', text })),
      }] : [],
    },
  } : {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: true, body: input.message!.trim() },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    let data: any = {};
    try { data = await response.json(); } catch { data = { error: { message: await response.text() } }; }
    if (response.ok) {
      return { success: true, messageId: data.messages?.[0]?.id, retryable: false };
    }
    const code = Number(data.error?.code || response.status);
    const message = String(data.error?.message || `WhatsApp API HTTP ${response.status}`);
    const lower = message.toLowerCase();
    const rateLimited = [80007, 130429, 429].includes(code) || lower.includes('rate limit') || response.status === 429;
    const notUser = code === 131026 || lower.includes('not a whatsapp user') || lower.includes('not registered');
    return {
      success: false,
      reason: rateLimited ? 'rate_limit' : notUser ? 'not_whatsapp_user' : 'api_error',
      error: message,
      errorCode: code,
      retryable: rateLimited || response.status >= 500,
    };
  } catch (error: any) {
    return { success: false, reason: 'network_error', error: error?.message || 'Network error', retryable: true };
  }
}

export async function sendWhatsAppDetailed(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
  const result = await dispatchWhatsAppMessage(input);
  const deliveryLogId = await recordWhatsAppDeliveryAttempt(input, result);
  if (!deliveryLogId && result.success) {
    await recordDeadLetter({
      source: 'communication.delivery-ledger',
      jobType: 'delivery_ledger',
      originalJobId: result.messageId ?? `whatsapp:${normalisePhone(input.to)}:${Date.now()}`,
      userId: input.recipientUserId ?? null,
      payload: {
        channel: 'whatsapp', provider: 'meta', providerMessageId: result.messageId ?? null,
        recipient: normalisePhone(input.to), sourceType: input.sourceType, sourceId: input.sourceId,
      },
      error: 'Provider accepted the message but its delivery ledger record could not be completed',
      attempts: input.attemptNumber ?? 1,
    });
  }
  if (result.success && input.persistToInbox !== false) {
    logOutboundMessageToDb(normalisePhone(input.to), result.messageId, input, deliveryLogId).catch((err) => {
      console.error('[sendWhatsAppDetailed] Failed to log outbound message to DB:', err);
    });
  }
  return { ...result, deliveryLogId, ledgerRecorded: Boolean(deliveryLogId) };
}

/** Backwards-compatible immediate text sender. */
export async function sendWhatsApp(to: string, message: string): Promise<boolean> {
  return (await sendWhatsAppDetailed({ to, message })).success;
}

export type WhatsAppOutboxJob = {
  recipientUserId?: string | null;
  phone: string;
  messageBody: string;
  templateName?: string | null;
  templateLanguage?: string;
  templateVariables?: string[];
  sourceType?: string | null;
  sourceId?: string | null;
  schoolId?: string | null;
  classId?: string | null;
  createdBy?: string | null;
  idempotencyKey?: string | null;
};

export async function enqueueWhatsApp(admin: SupabaseClient<any>, job: WhatsAppOutboxJob): Promise<{ id: string | null; deliveryId?: string | null; queued: boolean; error?: string }> {
  const phone = normalisePhone(job.phone);
  if (phone.length < 10) return { id: null, queued: false, error: 'Invalid phone number' };
  const { data: atomic, error: atomicError } = await admin.rpc('enqueue_whatsapp_delivery', {
    p_recipient_user_id: job.recipientUserId ?? null,
    p_phone: phone,
    p_message_body: job.messageBody,
    p_template_name: job.templateName ?? null,
    p_template_language: job.templateLanguage || 'en',
    p_template_variables: job.templateVariables ?? [],
    p_source_type: job.sourceType ?? null,
    p_source_id: job.sourceId ?? null,
    p_school_id: job.schoolId ?? null,
    p_class_id: job.classId ?? null,
    p_created_by: job.createdBy ?? null,
    p_idempotency_key: job.idempotencyKey ?? null,
  });
  if (!atomicError) {
    const row = atomic?.[0];
    return { id: row?.outbox_id ?? null, deliveryId: row?.delivery_id ?? null, queued: Boolean(row?.outbox_id) };
  }
  if (atomicError.code !== '42883' && atomicError.code !== 'PGRST202') {
    return { id: null, queued: false, error: atomicError.message };
  }
  // Safe rollout fallback while migration 118 is being applied.
  const { data, error } = await admin.from('whatsapp_outbox').upsert({
    recipient_user_id: job.recipientUserId ?? null,
    phone,
    message_body: job.messageBody,
    template_name: job.templateName ?? null,
    template_language: job.templateLanguage || 'en',
    template_variables: job.templateVariables ?? [],
    source_type: job.sourceType ?? null,
    source_id: job.sourceId ?? null,
    school_id: job.schoolId ?? null,
    class_id: job.classId ?? null,
    created_by: job.createdBy ?? null,
    idempotency_key: job.idempotencyKey ?? null,
    status: 'queued',
    next_attempt_at: new Date().toISOString(),
  }, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select('id').maybeSingle();
  if (error) return { id: null, queued: false, error: error.message };
  return { id: data?.id ?? null, deliveryId: null, queued: true };
}

export async function processWhatsAppOutbox(
  admin: SupabaseClient<any>, limit = 20,
  options: { marketingEnabled?: boolean } = {},
) {
  // Keep queued messages recoverable while production approval is pending.
  if (!isWhatsAppCloudApiApproved()) {
    return { processed: 0, sent: 0, retried: 0, failed: 0, cancelled: 0, unavailable: false, approvalPending: true };
  }
  const { data, error } = await admin.rpc('claim_whatsapp_outbox', { p_limit: limit });
  if (error) {
    if (error.code === '42883' || String(error.message).includes('does not exist')) return { processed: 0, sent: 0, retried: 0, failed: 0, cancelled: 0, unavailable: true };
    throw error;
  }
  const rows = (data ?? []) as any[];
  let sent = 0, retried = 0, failed = 0, cancelled = 0;
  for (const row of rows) {
    const marketingJob = /^(whatsapp_followup_|lead_bulk|lead_nurture|marketing)/i.test(String(row.source_type || ''));
    if (marketingJob) {
      let cancelReason = options.marketingEnabled === true ? '' : 'Marketing is turned off';
      if (!cancelReason) {
        const { data: optedOut } = await admin.from('whatsapp_conversations').select('id').eq('phone_number', row.phone).eq('opted_out', true).limit(1).maybeSingle();
        if (optedOut) cancelReason = 'Customer stopped WhatsApp messages';
      }
      if (!cancelReason) {
        let blocksQuery = admin.from('marketing_suppressions').select('portal_user_id,identity_type,identity_value,expires_at').in('channel', ['all', 'whatsapp']);
        blocksQuery = row.recipient_user_id
          ? blocksQuery.or(`portal_user_id.eq.${row.recipient_user_id},and(identity_type.eq.phone,identity_value.eq.${row.phone})`)
          : blocksQuery.eq('identity_type', 'phone').eq('identity_value', row.phone);
        const { data: blocks } = await blocksQuery;
        const activeBlock = (blocks ?? []).some((block: any) => !block.expires_at || new Date(block.expires_at).getTime() > Date.now());
        if (activeBlock) cancelReason = 'Customer marketing preference stopped this message';
      }
      if (cancelReason) {
        cancelled++;
        await admin.from('whatsapp_outbox').update({ status: 'cancelled', last_error: cancelReason, updated_at: new Date().toISOString() }).eq('id', row.id);
        await recordWhatsAppDeliveryAttempt(
          {
            to: row.phone,
            message: row.message_body,
            templateName: row.template_name,
            persistToInbox: false,
            automated: true,
            recipientUserId: row.recipient_user_id,
            schoolId: row.school_id,
            sourceType: row.source_type,
            sourceId: row.source_id,
            deliveryLogId: row.delivery_log_id,
            outboxId: row.id,
            idempotencyKey: `whatsapp-outbox:${row.id}`,
            attemptNumber: row.attempts,
            metadata: { outbox_id: row.id },
          },
          { success: false, reason: 'invalid_payload', error: cancelReason, retryable: false },
          { status: 'suppressed', metadata: { cancelled: true } },
        );
        continue;
      }
    }
    const result = await sendWhatsAppDetailed({
      to: row.phone,
      message: row.message_body,
      templateName: row.template_name,
      templateLanguage: row.template_language,
      templateVariables: Array.isArray(row.template_variables) ? row.template_variables.map(String) : [],
      automated: true,
      recipientUserId: row.recipient_user_id,
      schoolId: row.school_id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      deliveryLogId: row.delivery_log_id,
      outboxId: row.id,
      idempotencyKey: `whatsapp-outbox:${row.id}`,
      attemptNumber: row.attempts,
      metadata: { outbox_id: row.id, class_id: row.class_id },
    });
    if (result.deliveryLogId && !row.delivery_log_id) {
      await admin.from('whatsapp_outbox').update({ delivery_log_id: result.deliveryLogId }).eq('id', row.id);
      row.delivery_log_id = result.deliveryLogId;
    }
    if (result.success) {
      sent++;
      await admin.from('whatsapp_outbox').update({ status: 'sent', meta_message_id: result.messageId ?? null, last_error: null, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', row.id);
      continue;
    }
    const canRetry = result.retryable && row.attempts < row.max_attempts;
    if (canRetry) {
      retried++;
      const delayMinutes = Math.min(60, Math.pow(3, Math.max(0, row.attempts - 1)));
      await admin.from('whatsapp_outbox').update({ status: 'retry', last_error: result.error || result.reason, next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(), updated_at: new Date().toISOString() }).eq('id', row.id);
      if (row.delivery_log_id) {
        await recordWhatsAppDeliveryAttempt(
          {
            to: row.phone,
            message: row.message_body,
            templateName: row.template_name,
            deliveryLogId: row.delivery_log_id,
            outboxId: row.id,
            idempotencyKey: `whatsapp-outbox:${row.id}`,
            attemptNumber: row.attempts,
            persistToInbox: false,
            automated: true,
            metadata: { outbox_id: row.id, retry_scheduled: true, retry_in_minutes: delayMinutes },
          },
          { success: false, reason: result.reason, error: result.error, retryable: true },
          { status: 'queued' },
        );
      }
    } else {
      failed++;
      await admin.from('whatsapp_outbox').update({ status: 'failed', last_error: result.error || result.reason, updated_at: new Date().toISOString() }).eq('id', row.id);
      await recordDeadLetter({
        source: 'whatsapp.outbox',
        jobType: 'whatsapp',
        originalJobId: String(row.id),
        userId: row.recipient_user_id ?? null,
        payload: {
          phone: row.phone,
          messageBody: row.message_body,
          templateName: row.template_name,
          templateLanguage: row.template_language,
          templateVariables: row.template_variables,
          sourceType: row.source_type,
          sourceId: row.source_id,
          recipientUserId: row.recipient_user_id,
          schoolId: row.school_id,
          classId: row.class_id,
          idempotencyKey: `dead-letter-retry:${row.id}`,
        },
        error: result.error || result.reason || 'WhatsApp delivery failed',
        attempts: Number(row.attempts || 0),
      });
    }
  }
  return { processed: rows.length, sent, retried, failed, cancelled, unavailable: false };
}

/**
 * Centrally log all successful outbound WhatsApp messages (text or template)
 * to whatsapp_conversations and whatsapp_messages.
 */
async function logOutboundMessageToDb(
  to: string,
  messageId: string | undefined,
  input: WhatsAppSendInput,
  deliveryLogId?: string | null,
): Promise<void> {
  const sb = createAdminClient();
  const phone = normalisePhone(to);

  let bodyText = '';
  if (input.message) {
    bodyText = input.message.trim();
  } else if (input.templateName) {
    const vars = (input.templateVariables ?? []).join(', ');
    bodyText = `[Template: ${input.templateName}]${vars ? ` Variables: ${vars}` : ''}`;
  }

  if (!bodyText) return;

  // 1. Ensure conversation exists
  const { data: conv } = await sb
    .from('whatsapp_conversations')
    .select('id')
    .eq('phone_number', phone)
    .maybeSingle();

  let conversationId: string;

  if (conv?.id) {
    conversationId = conv.id;
    // Update last message preview
    await sb
      .from('whatsapp_conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: bodyText.slice(0, 100),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);
  } else {
    // Check if portal user exists to link
    const suffix = phone.slice(-10);
    const candidates = [
      phone,
      `+${phone}`,
      `0${suffix}`,
      suffix
    ];

    const { data: user } = await sb
      .from('portal_users')
      .select('id, full_name, school_name')
      .in('phone', candidates)
      .limit(1)
      .maybeSingle();

    const { data: newConv, error: insertErr } = await sb
      .from('whatsapp_conversations')
      .insert({
        phone_number: phone,
        contact_name: user?.full_name || `Contact (${phone})`,
        portal_user_id: user?.id || null,
        school_name: user?.school_name || null,
        last_message_at: new Date().toISOString(),
        last_message_preview: bodyText.slice(0, 100),
        unread_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle();

    if (insertErr) {
      // Handle concurrent race conditions (Postgres unique constraint code 23505)
      if ((insertErr as any).code === '23505') {
        const { data: retryConv } = await sb
          .from('whatsapp_conversations')
          .select('id')
          .eq('phone_number', phone)
          .maybeSingle();
        if (retryConv?.id) {
          conversationId = retryConv.id;
        } else {
          return;
        }
      } else {
        console.error('[logOutboundMessageToDb] Failed to insert conversation:', insertErr);
        return;
      }
    } else if (newConv?.id) {
      conversationId = newConv.id;
    } else {
      return;
    }
  }

  // 2. Insert message record
  const { data: messageRow, error: msgErr } = await sb.from('whatsapp_messages').insert({
    conversation_id: conversationId,
    direction: 'outbound',
    body: bodyText,
    meta_message_id: messageId || null,
    status: 'sent',
    created_at: new Date().toISOString(),
  }).select('id').maybeSingle();

  if (msgErr) {
    console.error('[logOutboundMessageToDb] Failed to insert message:', msgErr);
    return;
  }
  if (!deliveryLogId) return;
  const { data: delivery } = await (sb as any).from('communication_delivery_log')
    .select('metadata').eq('id', deliveryLogId).maybeSingle();
  await (sb as any).from('communication_delivery_log').update({
    metadata: {
      ...((delivery?.metadata ?? {}) as Record<string, unknown>),
      ...(input.metadata ?? {}),
      whatsapp_message_row_id: messageRow?.id || null,
      conversation_id: conversationId,
    },
    updated_at: new Date().toISOString(),
  }).eq('id', deliveryLogId);
}
