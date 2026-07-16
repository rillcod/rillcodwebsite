import { SMTP_FROM_EMAIL } from '@/config/brand';
import {
  buildRillcodTransactionalEmailHtml,
  escapeHtml,
} from '@/lib/email/rillcod-transactional-email';
import { notificationsService } from '@/services/notifications.service';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export type RegistrationPaymentEmailInput = {
  supabase: any;
  subjectId: string;
  reference: string;
  parentEmail: string;
  parentName?: string | null;
  studentName: string;
  programmeTitle?: string | null;
  schedule?: string | null;
  amount: number;
  paymentUrl?: string | null;
  paymentMethod?: 'paystack' | 'bank_transfer';
  force?: boolean;
};

export type RegistrationPaymentEmailResult = {
  delivered: boolean;
  alreadySent?: boolean;
  error?: string;
};

async function recordAttempt(
  input: RegistrationPaymentEmailInput,
  delivered: boolean,
  failureReason?: string,
): Promise<void> {
  const { error } = await input.supabase.from('notifications').insert({
    user_id: null,
    title: delivered ? 'Registration email delivered' : 'Registration email needs attention',
    message: `${input.studentName} | ${input.programmeTitle || 'Registration'} | ${input.reference}${failureReason ? ` | ${failureReason.slice(0, 300)}` : ''}`,
    type: delivered ? 'success' : 'error',
    notification_channel: 'email',
    delivery_status: delivered ? 'sent' : 'failed',
    retry_count: delivered ? 0 : 1,
    sent_at: delivered ? new Date().toISOString() : null,
    external_id: `registration:${input.subjectId}:${input.reference}`,
    action_url: '/dashboard/approvals',
  });
  if (error) {
    console.error('[registration-email] delivery tracking failed:', error);
  }
}

export async function sendRegistrationPaymentEmail(
  input: RegistrationPaymentEmailInput,
): Promise<RegistrationPaymentEmailResult> {
  const to = input.parentEmail.trim().toLowerCase();
  const externalId = `registration:${input.subjectId}:${input.reference}`;

  if (!EMAIL_RE.test(to)) {
    return { delivered: false, error: 'The registration email address is invalid.' };
  }

  const { data: previousDelivery } = await input.supabase
    .from('notifications')
    .select('id')
    .eq('external_id', externalId)
    .eq('delivery_status', 'sent')
    .limit(1)
    .maybeSingle();
  if (previousDelivery && !input.force) {
    return { delivered: true, alreadySent: true };
  }

  if (input.paymentMethod !== 'bank_transfer' && !input.paymentUrl) {
    await recordAttempt(input, false);
    return { delivered: false, error: 'The secure payment link is unavailable.' };
  }

  try {
    const { data: bankAccounts } = await input.supabase
      .from('payment_accounts')
      .select('bank_name, account_number, account_name')
      .eq('is_active', true)
      .limit(3);

    const paymentButton = input.paymentUrl
      ? `<div style="text-align:center;margin:26px 0;">
          <a href="${escapeHtml(input.paymentUrl)}" style="display:inline-block;padding:14px 28px;background:#2563eb;color:#fff;font-size:13px;font-weight:800;text-decoration:none;border-radius:8px;">Pay securely with Paystack</a>
          <p style="margin:9px 0 0;color:#a1a1aa;font-size:11px;">The secure link is tied to reference ${escapeHtml(input.reference)}.</p>
        </div>`
      : '';

    const bankDetails = Array.isArray(bankAccounts) && bankAccounts.length > 0
      ? `<div style="margin-top:22px;padding:18px;background:#1e1e2f;border:1px solid #3b3b4f;border-radius:8px;">
          <p style="margin:0 0 12px;color:#fff;font-size:12px;font-weight:800;text-transform:uppercase;">Bank transfer option</p>
          ${bankAccounts.map((account: any) => `
            <div style="margin:0 0 11px;padding:0 0 11px;border-bottom:1px solid #3b3b4f;">
              <p style="margin:0 0 4px;color:#fff;font-size:12px;font-weight:700;">${escapeHtml(String(account.bank_name || 'Bank'))}</p>
              <p style="margin:0 0 4px;color:#38bdf8;font:700 13px monospace;">${escapeHtml(String(account.account_number || ''))}</p>
              <p style="margin:0;color:#a1a1aa;font-size:11px;">${escapeHtml(String(account.account_name || 'Rillcod Technologies'))}</p>
            </div>`).join('')}
          <p style="margin:8px 0 0;color:#a1a1aa;font-size:11px;">Use the learner name or reference as the narration, then keep your transfer receipt.</p>
        </div>`
      : '';

    const programme = input.programmeTitle || 'Rillcod programme';
    const emailHtml = buildRillcodTransactionalEmailHtml({
      eyebrow: 'Admissions',
      title: 'Complete your registration',
      bodyHtml: `
        <p style="margin:0 0 12px;color:#fff;font-size:15px;">Dear ${escapeHtml(input.parentName || 'Parent / Guardian')},</p>
        <p style="margin:0 0 16px;color:#a1a1aa;font-size:13px;line-height:1.65;">
          We received the registration for <strong style="color:#fff;">${escapeHtml(input.studentName)}</strong>.
          Complete payment to secure the learner's place in <strong style="color:#fff;">${escapeHtml(programme)}</strong>.
        </p>
        ${paymentButton}
        ${bankDetails}
      `,
      summaryRows: [
        { label: 'Learner', value: input.studentName },
        { label: 'Programme', value: programme },
        ...(input.schedule ? [{ label: 'Schedule', value: input.schedule }] : []),
        { label: 'Amount due', value: `NGN ${Number(input.amount).toLocaleString()}` },
        { label: 'Reference', value: input.reference },
      ],
      footerNote: 'Secure registration message from Rillcod Technologies. Support: support@rillcod.com',
    });

    await notificationsService.sendExternalEmail({
      to,
      subject: `Complete registration for ${input.studentName} ? Rillcod Technologies`,
      fromName: 'Rillcod Technologies',
      fromEmail: SMTP_FROM_EMAIL,
      html: emailHtml,
    });

    await recordAttempt(input, true);
    return { delivered: true };
  } catch (error: unknown) {
    console.error('[registration-email] send failed:', error);
    const message = error instanceof Error ? error.message : 'Email delivery failed';
    await recordAttempt(input, false, message);
    return {
      delivered: false,
      error: /credentials are not configured/i.test(message)
        ? 'Registration saved, but the email service is not configured.'
        : /quota|bandwidth|sending limit|limit exceeded/i.test(message)
          ? 'Registration saved, but the email sending quota is exhausted. Please use the payment reference or try Resend after capacity is restored.'
          : 'Registration saved, but the payment email could not be delivered.',
    };
  }
}
