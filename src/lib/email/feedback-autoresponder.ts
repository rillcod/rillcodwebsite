import { notificationsService } from '@/services/notifications.service';
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
  const html = buildFeedbackAutoResponseEmail({
    recipientName: opts?.recipientName,
    feedbackText: text,
    category: opts?.category,
  });

  try {
    await notificationsService.sendExternalEmail({
      to,
      subject: 'Rillcod Technologies — we received your feedback',
      html,
    });
    return { sent: true };
  } catch (error) {
    console.error('[feedback] Central email delivery failed:', error);
    return { sent: false, reason: 'email_delivery_failed' };
  }
}
