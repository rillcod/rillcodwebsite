/**
 * Send a WhatsApp message via the WhatsApp Business Cloud API (Meta).
 * Silently returns false if env vars are missing (graceful no-op in dev).
 *
 * Required env vars:
 *   WHATSAPP_PHONE_NUMBER_ID  — your Business phone number ID from Meta Developer Console
 *   WHATSAPP_ACCESS_TOKEN     — permanent or temporary system user access token
 *
 * Optional:
 *   WHATSAPP_API_VERSION      — Graph API version (default: v21.0)
 */

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('234')) return digits;
  if (digits.startsWith('0'))   return '234' + digits.slice(1);
  if (digits.length >= 10)      return '234' + digits.slice(-10);
  return digits;
}

export async function sendWhatsApp(to: string, message: string): Promise<boolean> {
  try {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken   = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) return false;
    if (!to?.trim()) return false;

    const normalised = normalisePhone(to);
    if (!normalised || normalised.length < 10) return false;

    const version = process.env.WHATSAPP_API_VERSION ?? 'v21.0';
    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalised,
        type: 'text',
        text: {
          preview_url: false,
          body: message,
        },
      }),
    });

    return res.ok;
  } catch {
    return false;
  }
}
