import { buildFeedbackAutoResponseEmail } from './rillcod-transactional-email';

/**
 * Sends the feedback auto-response email when outbound email is configured.
 * Set RESEND_API_KEY + RESEND_FROM_EMAIL (Resend) to enable delivery; otherwise logs only.
 */
export async function sendFeedbackAutoResponseEmail(
  to: string,
  text: string,
  opts?: { recipientName?: string; category?: string }
): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    console.info('[feedback] Auto-response email skipped (set RESEND_API_KEY + RESEND_FROM_EMAIL). To:', to);
    return { sent: false, reason: 'email_not_configured' };
  }

  const html = buildFeedbackAutoResponseEmail({
    recipientName: opts?.recipientName,
    feedbackText:  text,
    category:      opts?.category,
  });

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: 'Rillcod Technologies — we received your feedback',
        html,
        text,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[feedback] Resend error:', res.status, errText);
      return { sent: false, reason: 'resend_http_error' };
    }

    return { sent: true };
  } catch (e) {
    console.error('[feedback] Resend fetch failed:', e);
    return { sent: false, reason: 'network_error' };
  }
}
