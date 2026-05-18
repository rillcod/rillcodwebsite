/**
 * Send a WhatsApp message via Twilio.
 * Silently returns false if env vars are missing (graceful no-op in dev).
 * Env vars needed: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
 * Optional: TWILIO_WHATSAPP_FROM (defaults to Twilio sandbox number)
 */

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('234')) return '+' + digits;
  if (digits.startsWith('0'))   return '+234' + digits.slice(1);
  if (digits.length >= 10)      return '+234' + digits.slice(-10);
  return '+' + digits;
}

export async function sendWhatsApp(to: string, message: string): Promise<boolean> {
  try {
    const sid   = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;

    if (!sid || !token) return false;

    if (!to?.trim()) return false;
    const normalised = normalisePhone(to);
    if (!normalised || normalised === '+') return false;

    const from = process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886';
    const toWa = `whatsapp:${normalised}`;

    const credentials = Buffer.from(`${sid}:${token}`).toString('base64');
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;

    const body = new URLSearchParams();
    body.append('From', from);
    body.append('To', toWa);
    body.append('Body', message);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    return res.ok;
  } catch {
    return false;
  }
}
