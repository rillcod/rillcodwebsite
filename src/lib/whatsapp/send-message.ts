import { NextResponse } from 'next/server';
import { isWhatsAppCloudApiApproved, WHATSAPP_APPROVAL_PENDING_MESSAGE } from './approval';

const ALLOWED_WA_HOSTS = ['graph.facebook.com'];

export interface WhatsAppMessagePayload {
  to: string;
  type: 'text' | 'template';
  body?: string;
  templateName?: string;
  templateVariables?: string[];
}

export async function sendWhatsAppMessage(payload: WhatsAppMessagePayload): Promise<{ success: boolean; error?: string; messageId?: string }> {
  if (!isWhatsAppCloudApiApproved()) {
    return { success: false, error: WHATSAPP_APPROVAL_PENDING_MESSAGE };
  }
  const apiUrl = process.env.WHATSAPP_API_URL;
  const apiToken = process.env.WHATSAPP_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!apiUrl || !apiToken || !phoneNumberId) {
    return { success: false, error: 'WhatsApp API not configured' };
  }

  // Validate URL against allowlist to prevent SSRF
  try {
    const parsed = new URL(apiUrl);
    if (!ALLOWED_WA_HOSTS.includes(parsed.hostname)) {
      console.error('[whatsapp] Blocked request to non-allowlisted host:', parsed.hostname);
      return { success: false, error: 'Invalid WhatsApp API URL configuration' };
    }
  } catch {
    return { success: false, error: 'Malformed WhatsApp API URL' };
  }

  let messageBody: Record<string, unknown>;
  if (payload.type === 'template') {
    messageBody = {
      messaging_product: 'whatsapp',
      to: payload.to,
      type: 'template',
      template: {
        name: payload.templateName,
        language: { code: 'en' },
        components: payload.templateVariables?.length ? [{
          type: 'body',
          parameters: payload.templateVariables.map(v => ({ type: 'text', text: v })),
        }] : [],
      },
    };
  } else {
    messageBody = {
      messaging_product: 'whatsapp',
      to: payload.to,
      type: 'text',
      text: { body: payload.body },
    };
  }

  try {
    const res = await fetch(`${apiUrl}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messageBody),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data?.error?.message || 'WhatsApp API error' };
    }
    return { success: true, messageId: data?.messages?.[0]?.id };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error' };
  }
}
