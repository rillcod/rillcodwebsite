import { SMTP_FROM_EMAIL, SMTP_FROM_NAME } from '@/config/brand';
import {
  buildRillcodTransactionalEmailHtml,
  escapeHtml,
} from '@/lib/email/rillcod-transactional-email';
import { notificationsService } from '@/services/notifications.service';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export type NativeEnrolmentAcknowledgementInput = {
  supabase: any;
  subjectId: string;
  reference: string;
  parentEmail: string;
  parentName?: string | null;
  studentName: string;
  programmeTitle?: string | null;
};

export type NativeEnrolmentAcknowledgementResult = {
  delivered: boolean;
  alreadySent?: boolean;
  error?: string;
};

/**
 * Acknowledges an Android enrolment enquiry without prices, bank details,
 * checkout links, or language that directs the user to an external purchase.
 */
export async function sendNativeEnrolmentAcknowledgement(
  input: NativeEnrolmentAcknowledgementInput,
): Promise<NativeEnrolmentAcknowledgementResult> {
  const to = input.parentEmail.trim().toLowerCase();
  const externalId = `native-enrolment:${input.subjectId}`;

  if (!EMAIL_RE.test(to)) {
    return { delivered: false, error: 'The enrolment email address is invalid.' };
  }

  const { data: previousDelivery } = await input.supabase
    .from('notifications')
    .select('id')
    .eq('external_id', externalId)
    .eq('delivery_status', 'sent')
    .limit(1)
    .maybeSingle();
  if (previousDelivery) return { delivered: true, alreadySent: true };

  const programme = input.programmeTitle || 'Rillcod programme';
  const html = buildRillcodTransactionalEmailHtml({
    eyebrow: 'Admissions',
    title: 'Enrolment request received',
    bodyHtml: `
      <p style="margin:0 0 12px;color:#fff;font-size:15px;">Dear ${escapeHtml(input.parentName || 'Parent / Guardian')},</p>
      <p style="margin:0 0 16px;color:#a1a1aa;font-size:13px;line-height:1.65;">
        We received the enrolment request for <strong style="color:#fff;">${escapeHtml(input.studentName)}</strong>
        and our admissions team will review the submitted details. Keep the reference below if you need support.
      </p>
      <p style="margin:0;color:#a1a1aa;font-size:12px;line-height:1.6;">
        No purchase was started in the Android app. You do not need to submit the learner details again.
      </p>
    `,
    summaryRows: [
      { label: 'Learner', value: input.studentName },
      { label: 'Programme interest', value: programme },
      { label: 'Reference', value: input.reference },
    ],
    footerNote: 'Enrolment acknowledgement from Rillcod Technologies. Support: support@rillcod.com',
  });

  try {
    await notificationsService.sendExternalEmail({
      to,
      subject: `Enrolment request received for ${input.studentName} | Rillcod Technologies`,
      fromName: SMTP_FROM_NAME,
      fromEmail: SMTP_FROM_EMAIL,
      html,
    });

    const { error } = await input.supabase.from('notifications').insert({
      user_id: null,
      title: 'Android enrolment acknowledgement delivered',
      message: `${input.studentName} | ${programme} | ${input.reference}`,
      type: 'success',
      notification_channel: 'email',
      delivery_status: 'sent',
      retry_count: 0,
      sent_at: new Date().toISOString(),
      external_id: externalId,
      action_url: '/dashboard/approvals',
    });
    if (error) console.error('[native-enrolment] delivery tracking failed:', error);
    return { delivered: true };
  } catch (error: unknown) {
    console.error('[native-enrolment] acknowledgement failed:', error);
    const message = error instanceof Error ? error.message : 'Email delivery failed';
    return {
      delivered: false,
      error: /quota|bandwidth|sending limit|limit exceeded/i.test(message)
        ? 'The request is saved, but the acknowledgement email service is temporarily at capacity.'
        : 'The request is saved, but the acknowledgement email could not be delivered.',
    };
  }
}
