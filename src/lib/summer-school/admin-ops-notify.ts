import { env } from '@/config/env';
import { SMTP_FROM_EMAIL } from '@/config/brand';

export type SpecialProgramOpsNotice = {
  studentName: string;
  parentEmail: string;
  amount: number;
  method: string;
  reference: string;
  programmeTitle?: string;
  receiptUrl?: string | null;
  transferReference?: string | null;
  totalTuition?: number;
  balanceDue?: number;
  context?: 'registration' | 'balance';
};

/** Internal ops email when a parent submits bank transfer proof for a special programme. */
export async function notifySpecialProgramAdminOps(payload: SpecialProgramOpsNotice): Promise<void> {
  const adminTo = env.ADMIN_OPS_EMAIL?.trim();
  if (!adminTo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(adminTo)) return;

  try {
    const { notificationsService } = await import('@/services/notifications.service');
    const { buildRillcodTransactionalEmailHtml } = await import('@/lib/email/rillcod-transactional-email');
    const programme = payload.programmeTitle || 'Special programme';
    const isBalance = payload.context === 'balance';
    const receiptRow = payload.receiptUrl
      ? [{ label: 'Receipt', value: payload.receiptUrl }]
      : payload.transferReference
        ? [{ label: 'Transfer reference', value: payload.transferReference }]
        : [];
    const html = buildRillcodTransactionalEmailHtml({
      eyebrow: 'Operations',
      title: isBalance
        ? `Balance payment — ${programme}`
        : `Bank transfer registration — ${programme}`,
      bodyHtml: payload.receiptUrl
        ? `<p style="margin:0 0 10px;">A parent submitted a <strong>${isBalance ? 'balance payment' : 'special-programme registration'}</strong> with a receipt screenshot. Verify in Dashboard → Approvals.</p>
           <p style="margin:0;"><a href="${payload.receiptUrl}" style="color:#7c3aed;font-weight:700;">Open receipt screenshot →</a></p>`
        : `<p style="margin:0;">A parent submitted a ${isBalance ? 'balance payment' : 'special-programme registration'} with a bank transfer reference. Match the payment in Dashboard → Approvals.</p>`,
      summaryRows: [
        { label: 'Student', value: payload.studentName },
        { label: 'Parent email', value: payload.parentEmail },
        { label: 'Programme', value: programme },
        { label: 'Amount submitted', value: `₦${payload.amount.toLocaleString()}` },
        ...(payload.totalTuition != null
          ? [{ label: 'Total tuition', value: `₦${payload.totalTuition.toLocaleString()}` }]
          : []),
        ...(payload.balanceDue != null && payload.balanceDue > 0
          ? [{ label: 'Balance after verify', value: `₦${payload.balanceDue.toLocaleString()}` }]
          : []),
        { label: 'Method', value: payload.method },
        { label: 'Reference', value: payload.reference },
        ...receiptRow,
      ],
      footerNote: 'Internal ops notice — review in Dashboard → Approvals.',
    });
    await notificationsService.sendExternalEmail({
      to: adminTo,
      subject: isBalance
        ? `${programme} — verify balance transfer (${payload.studentName})`
        : `${programme} — verify bank transfer (${payload.studentName})`,
      fromName: 'Rillcod Technologies',
      fromEmail: SMTP_FROM_EMAIL,
      html,
    });
  } catch (err) {
    console.error('[special-program] admin ops email failed:', err);
  }
}
