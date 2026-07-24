import { SMTP_FROM_EMAIL } from '@/config/brand';
import {
  buildRillcodTransactionalEmailHtml,
  escapeHtml,
} from '@/lib/email/rillcod-transactional-email';
import { notificationsService } from '@/services/notifications.service';
import { SPECIAL_BALANCE_PATH, TERM_BALANCE_PATH } from '@/lib/registration/enrollment-types';

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
  totalTuition?: number | null;
  balanceDue?: number | null;
  /** Public URL when the parent uploaded a transfer receipt screenshot. */
  receiptUrl?: string | null;
  /** Plain-text bank transfer reference / depositor name when no receipt file was uploaded. */
  transferReference?: string | null;
  /** Which public balance page to link when balanceDue > 0. */
  balancePageKind?: 'term' | 'special';
  force?: boolean;
};

function buildBalancePageUrl(kind: 'term' | 'special', parentEmail?: string | null): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com').replace(/\/$/, '');
  const path = kind === 'term' ? TERM_BALANCE_PATH : SPECIAL_BALANCE_PATH;
  const email = parentEmail?.trim();
  return email ? `${base}${path}?email=${encodeURIComponent(email)}` : `${base}${path}`;
}

function renderBalanceDueHtml(input: RegistrationPaymentEmailInput): string {
  if (input.balanceDue == null || input.balanceDue <= 0) return '';
  const balanceLabel = `NGN ${Number(input.balanceDue).toLocaleString()}`;
  if (input.balancePageKind) {
    const balanceUrl = buildBalancePageUrl(input.balancePageKind, input.parentEmail);
    return `<p style="margin:0 0 12px;color:#f59e0b;font-size:13px;line-height:1.65;">
      After this payment is verified, your remaining programme balance will be
      <strong style="color:#fff;">${balanceLabel}</strong>.
      Pay before week 3 on the
      <a href="${escapeHtml(balanceUrl)}" style="color:#38bdf8;font-weight:700;">balance payment page</a>.
    </p>`;
  }
  return `<p style="margin:0 0 12px;color:#f59e0b;font-size:13px;line-height:1.65;">
    After this payment is verified, your remaining programme balance will be
    <strong style="color:#fff;">${balanceLabel}</strong>.
    You can pay the balance before week 3 from the balance payment page.
  </p>`;
}

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
    const programme = input.programmeTitle || 'Rillcod programme';
    const amountLabel = `NGN ${Number(input.amount).toLocaleString()}`;
    const bankTransferSubmitted =
      input.paymentMethod === 'bank_transfer' &&
      Boolean(input.receiptUrl || input.transferReference);

    if (bankTransferSubmitted) {
      const receiptBlock = input.receiptUrl
        ? `<p style="margin:0 0 14px;color:#a1a1aa;font-size:13px;line-height:1.65;">
             We received your <strong style="color:#fff;">payment receipt screenshot</strong> and our finance team is verifying it.
           </p>`
        : `<p style="margin:0 0 14px;color:#a1a1aa;font-size:13px;line-height:1.65;">
             We received your transfer reference <strong style="color:#fff;">${escapeHtml(String(input.transferReference || input.reference))}</strong> and our finance team is matching it to your payment.
           </p>`;

      const emailHtml = buildRillcodTransactionalEmailHtml({
        eyebrow: 'Admissions',
        title: 'Registration received — verification in progress',
        bodyHtml: `
          <p style="margin:0 0 12px;color:#fff;font-size:15px;">Dear ${escapeHtml(input.parentName || 'Parent / Guardian')},</p>
          <p style="margin:0 0 16px;color:#a1a1aa;font-size:13px;line-height:1.65;">
            Thank you for registering <strong style="color:#fff;">${escapeHtml(input.studentName)}</strong> for
            <strong style="color:#fff;">${escapeHtml(programme)}</strong>.
          </p>
          ${receiptBlock}
          <p style="margin:0 0 12px;color:#a1a1aa;font-size:13px;line-height:1.65;">
            Verification usually completes within <strong style="color:#fff;">1–2 business days</strong>.
            Once confirmed, we email your <strong style="color:#fff;">parent and student portal login details</strong>.
          </p>
          ${renderBalanceDueHtml(input)}
          <p style="margin:0;color:#71717a;font-size:12px;line-height:1.6;">
            Need help? Reply to this email or WhatsApp us with your learner's name.
          </p>
        `,
        summaryRows: [
          { label: 'Learner', value: input.studentName },
          { label: 'Programme', value: programme },
          ...(input.schedule ? [{ label: 'Schedule', value: input.schedule }] : []),
          { label: 'Amount submitted', value: amountLabel },
          ...(input.totalTuition != null
            ? [{ label: 'Total tuition', value: `NGN ${Number(input.totalTuition).toLocaleString()}` }]
            : []),
          ...(input.balanceDue != null && input.balanceDue > 0
            ? [{ label: 'Balance after verify', value: `NGN ${Number(input.balanceDue).toLocaleString()}` }]
            : []),
          { label: 'Status', value: 'Verification pending' },
          {
            label: input.receiptUrl ? 'Receipt' : 'Transfer reference',
            value: input.receiptUrl ? 'Screenshot uploaded' : String(input.transferReference || input.reference),
          },
        ],
        footerNote: 'Secure registration message from Rillcod Technologies. Support: support@rillcod.com',
      });

      await notificationsService.sendExternalEmail({
        to,
        subject: `Registration received — ${input.studentName} (${programme})`,
        fromName: 'Rillcod Technologies',
        fromEmail: SMTP_FROM_EMAIL,
        html: emailHtml,
      });

      await recordAttempt(input, true);
      return { delivered: true };
    }

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
        ${renderBalanceDueHtml(input)}
      `,
      summaryRows: [
        { label: 'Learner', value: input.studentName },
        { label: 'Programme', value: programme },
        ...(input.schedule ? [{ label: 'Schedule', value: input.schedule }] : []),
        { label: 'Amount due', value: amountLabel },
        ...(input.totalTuition != null
          ? [{ label: 'Total tuition', value: `NGN ${Number(input.totalTuition).toLocaleString()}` }]
          : []),
        ...(input.balanceDue != null && input.balanceDue > 0
          ? [{ label: 'Balance after pay', value: `NGN ${Number(input.balanceDue).toLocaleString()}` }]
          : []),
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
