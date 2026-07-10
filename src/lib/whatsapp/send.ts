import type { SupabaseClient } from '@supabase/supabase-js';

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
};

export type WhatsAppSendResult = {
  success: boolean;
  messageId?: string;
  reason?: 'credentials_missing' | 'invalid_phone' | 'invalid_payload' | 'rate_limit' | 'not_whatsapp_user' | 'api_error' | 'network_error';
  error?: string;
  errorCode?: number;
  retryable: boolean;
};

function config() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID;
  const version = process.env.WHATSAPP_API_VERSION ?? 'v21.0';
  return {
    url: process.env.WHATSAPP_API_URL || (phoneNumberId ? `https://graph.facebook.com/${version}/${phoneNumberId}/messages` : ''),
    token: process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_API_TOKEN || '',
  };
}

export async function sendWhatsAppDetailed(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
  const { url, token } = config();
  if (!url || !token) return { success: false, reason: 'credentials_missing', error: 'WhatsApp API credentials are not configured', retryable: true };
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
    if (response.ok) return { success: true, messageId: data.messages?.[0]?.id, retryable: false };
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

export async function enqueueWhatsApp(admin: SupabaseClient<any>, job: WhatsAppOutboxJob): Promise<{ id: string | null; queued: boolean; error?: string }> {
  const phone = normalisePhone(job.phone);
  if (phone.length < 10) return { id: null, queued: false, error: 'Invalid phone number' };
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
  return { id: data?.id ?? null, queued: true };
}

export async function processWhatsAppOutbox(admin: SupabaseClient<any>, limit = 20) {
  const { data, error } = await admin.rpc('claim_whatsapp_outbox', { p_limit: limit });
  if (error) {
    if (error.code === '42883' || String(error.message).includes('does not exist')) return { processed: 0, sent: 0, retried: 0, failed: 0, unavailable: true };
    throw error;
  }
  const rows = (data ?? []) as any[];
  let sent = 0, retried = 0, failed = 0;
  for (const row of rows) {
    const result = await sendWhatsAppDetailed({
      to: row.phone,
      message: row.message_body,
      templateName: row.template_name,
      templateLanguage: row.template_language,
      templateVariables: Array.isArray(row.template_variables) ? row.template_variables.map(String) : [],
    });
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
    } else {
      failed++;
      await admin.from('whatsapp_outbox').update({ status: 'failed', last_error: result.error || result.reason, updated_at: new Date().toISOString() }).eq('id', row.id);
    }
  }
  return { processed: rows.length, sent, retried, failed, unavailable: false };
}