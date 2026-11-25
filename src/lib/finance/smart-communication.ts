import { invoiceOutstandingAmount, invoiceOverpaidAmount } from './invoice-state';

export type SmartInvoiceUrgency =
  | 'overdue'
  | 'due_soon'
  | 'partial'
  | 'open'
  | 'paid'
  | 'credit'
  | 'closed';

export interface SmartInvoiceDiagnostics {
  billed: number;
  paid: number;
  remaining: number;
  overpaid: number;
  percentPaid: number;
  urgency: SmartInvoiceUrgency;
  urgencyLabel: string;
  daysDelta: number | null;
  recommendedReminderStage: 1 | 2 | 3;
  remindersSentCount: number;
  lastRemindedAt: string | null;
}

const SYNTHETIC_EMAIL_DOMAINS = [
  '@rillcod.local',
  '@student.rillcod.local',
  '@student.local',
  '@local.invalid',
  '@example.com',
];

/**
 * Returns true if an email address is a real external inbox (not a synthetic
 * kiosk/student login handle like `john.doe@rillcod.local`).
 */
export function isDeliverableExternalEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const trimmed = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return false;
  return !SYNTHETIC_EMAIL_DOMAINS.some((suffix) => trimmed.endsWith(suffix));
}

export function normalizeWhatsAppPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('234') && digits.length >= 13) return digits;
  if (digits.startsWith('0') && digits.length === 11) return `234${digits.slice(1)}`;
  if (digits.length === 10) return `234${digits}`;
  return digits.length >= 10 ? digits : '';
}

export function buildWhatsAppShareHref(phone: string | null | undefined, message: string): string {
  const normalized = normalizeWhatsAppPhone(phone);
  const encoded = encodeURIComponent(message);
  return normalized ? `https://wa.me/${normalized}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

function fmtCurrency(amount: number, currency = 'NGN'): string {
  const c = String(currency || 'NGN').toUpperCase();
  const n = Math.round((Number(amount) || 0) * 100) / 100;
  if (c === 'USD') return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (c === 'NGN') return `₦${n.toLocaleString('en-NG')}`;
  return `${c} ${n.toLocaleString('en-US')}`;
}

export function analyzeInvoiceIntelligence(
  invoice: {
    amount?: number | null;
    original_amount?: number | null;
    amount_paid?: number | null;
    amount_remaining?: number | null;
    status?: string | null;
    due_date?: string | null;
    reminder_1_sent_at?: string | null;
    reminder_2_sent_at?: string | null;
    reminder_3_sent_at?: string | null;
  },
  nowMs: number = Date.now(),
): SmartInvoiceDiagnostics {
  const status = String(invoice.status || 'draft').toLowerCase();
  const billed = Math.max(0, Number(invoice.original_amount ?? invoice.amount ?? 0) || 0);
  const paid = Math.max(0, Number(invoice.amount_paid ?? 0) || 0);
  const remaining = invoiceOutstandingAmount(invoice as any);
  const overpaid = invoiceOverpaidAmount(invoice as any);
  const percentPaid = billed > 0 ? Math.min(100, Math.round((paid / billed) * 100)) : status === 'paid' ? 100 : 0;

  const reminderDates = [
    invoice.reminder_1_sent_at,
    invoice.reminder_2_sent_at,
    invoice.reminder_3_sent_at,
  ].filter((d): d is string => Boolean(d));
  const remindersSentCount = reminderDates.length;
  const lastRemindedAt =
    reminderDates.length > 0
      ? reminderDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
      : null;

  let daysDelta: number | null = null;
  if (invoice.due_date) {
    const dueMs = new Date(invoice.due_date).getTime();
    if (!Number.isNaN(dueMs)) {
      daysDelta = Math.ceil((dueMs - nowMs) / 86_400_000);
    }
  }

  if (status === 'cancelled' || status === 'void') {
    return {
      billed,
      paid,
      remaining: 0,
      overpaid: 0,
      percentPaid,
      urgency: 'closed',
      urgencyLabel: status === 'void' ? 'Void' : 'Cancelled',
      daysDelta,
      recommendedReminderStage: 1,
      remindersSentCount,
      lastRemindedAt,
    };
  }

  if (overpaid > 0) {
    return {
      billed,
      paid,
      remaining: 0,
      overpaid,
      percentPaid: 100,
      urgency: 'credit',
      urgencyLabel: 'Credit Balance',
      daysDelta,
      recommendedReminderStage: 1,
      remindersSentCount,
      lastRemindedAt,
    };
  }

  if (status === 'paid' || (billed > 0 && remaining <= 0.01 && paid > 0)) {
    return {
      billed,
      paid,
      remaining: 0,
      overpaid: 0,
      percentPaid: 100,
      urgency: 'paid',
      urgencyLabel: 'Settled',
      daysDelta,
      recommendedReminderStage: 1,
      remindersSentCount,
      lastRemindedAt,
    };
  }

  const isPastDue = status === 'overdue' || (daysDelta !== null && daysDelta < 0);
  if (isPastDue) {
    const overdueDays = daysDelta !== null && daysDelta < 0 ? Math.abs(daysDelta) : 1;
    return {
      billed,
      paid,
      remaining,
      overpaid: 0,
      percentPaid,
      urgency: 'overdue',
      urgencyLabel: `${overdueDays}d overdue`,
      daysDelta,
      recommendedReminderStage: 3,
      remindersSentCount,
      lastRemindedAt,
    };
  }

  if (daysDelta !== null && daysDelta <= 5) {
    return {
      billed,
      paid,
      remaining,
      overpaid: 0,
      percentPaid,
      urgency: 'due_soon',
      urgencyLabel: daysDelta === 0 ? 'Due today' : `Due in ${daysDelta}d`,
      daysDelta,
      recommendedReminderStage: 2,
      remindersSentCount,
      lastRemindedAt,
    };
  }

  if (status === 'partially_paid' || paid > 0) {
    return {
      billed,
      paid,
      remaining,
      overpaid: 0,
      percentPaid,
      urgency: 'partial',
      urgencyLabel: `${percentPaid}% paid`,
      daysDelta,
      recommendedReminderStage: 2,
      remindersSentCount,
      lastRemindedAt,
    };
  }

  return {
    billed,
    paid,
    remaining,
    overpaid: 0,
    percentPaid,
    urgency: 'open',
    urgencyLabel: daysDelta !== null ? `Due in ${daysDelta}d` : 'Open',
    daysDelta,
    recommendedReminderStage: invoice.reminder_1_sent_at ? 2 : 1,
    remindersSentCount,
    lastRemindedAt,
  };
}

export function buildSmartFinanceWhatsAppText(opts: {
  mode: 'invoice' | 'reminder_1' | 'reminder_2' | 'reminder_3' | 'receipt';
  recipientName: string;
  invoiceNumber: string;
  currency?: string | null;
  totalAmount: number;
  amountPaid?: number | null;
  remainingAmount?: number | null;
  overpaidAmount?: number | null;
  dueDate?: string | null;
  termLabel?: string | null;
  bankAccount?: { bank_name: string; account_number: string; account_name: string } | null;
  paymentUrl?: string | null;
  receiptUrl?: string | null;
  customNote?: string | null;
}): string {
  const cur = opts.currency || 'NGN';
  const totalStr = fmtCurrency(opts.totalAmount, cur);
  const paidNum = Math.max(0, Number(opts.amountPaid ?? 0) || 0);
  const remNum = Math.max(
    0,
    opts.remainingAmount != null ? Number(opts.remainingAmount) : Math.max(0, opts.totalAmount - paidNum),
  );
  const overNum = Math.max(0, Number(opts.overpaidAmount ?? 0) || 0);
  const dueStr = opts.dueDate
    ? new Date(opts.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  if (opts.mode === 'receipt') {
    const lines = [
      `*PAYMENT RECEIPT — RILLCOD TECHNOLOGIES*`,
      `Hello ${opts.recipientName || 'Valued Partner'},`,
      ``,
      `We have received and verified your payment on Invoice *#${opts.invoiceNumber}*${opts.termLabel ? ` (${opts.termLabel})` : ''}.`,
      `• *Invoice Total:* ${totalStr}`,
      `• *Total Paid:* ${fmtCurrency(paidNum > 0 ? paidNum : opts.totalAmount, cur)}`,
      overNum > 0
        ? `• *Status:* PAID IN FULL (+${fmtCurrency(overNum, cur)} credit on ledger)`
        : remNum > 0.01
          ? `• *Remaining Balance:* ${fmtCurrency(remNum, cur)}`
          : `• *Status:* PAID IN FULL`,
      opts.customNote ? `\n_Note: ${opts.customNote.trim()}_` : null,
      opts.receiptUrl ? `\nDownload Receipt: ${opts.receiptUrl}` : null,
      ``,
      `Thank you for partnering with Rillcod Technologies.`,
    ];
    return lines.filter(Boolean).join('\n');
  }

  const headline =
    opts.mode === 'reminder_3'
      ? `*URGENT OVERDUE NOTICE — Invoice #${opts.invoiceNumber}*`
      : opts.mode === 'reminder_2'
        ? `*PAYMENT REMINDER — Invoice #${opts.invoiceNumber}*`
        : `*INVOICE NOTICE — Invoice #${opts.invoiceNumber}*`;

  const intro =
    opts.mode === 'reminder_3'
      ? `Your invoice${opts.termLabel ? ` for *${opts.termLabel}*` : ''} is now *overdue*. Kindly settle the outstanding balance immediately to avoid service interruption.`
      : opts.mode === 'reminder_2'
        ? `Friendly reminder regarding your ${paidNum > 0 ? 'remaining balance' : 'upcoming payment'}${opts.termLabel ? ` for *${opts.termLabel}*` : ''}.`
        : `Please find the summary of your invoice${opts.termLabel ? ` for *${opts.termLabel}*` : ''} from Rillcod Technologies.`;

  const lines = [
    headline,
    `Hello ${opts.recipientName || 'Valued Client'},`,
    ``,
    intro,
    ``,
    `• *Invoice Ref:* #${opts.invoiceNumber}`,
    paidNum > 0 ? `• *Total Billed:* ${totalStr}` : null,
    paidNum > 0 ? `• *Already Paid:* ${fmtCurrency(paidNum, cur)}` : null,
    `• *Amount Due:* *${fmtCurrency(remNum > 0 ? remNum : opts.totalAmount, cur)}*`,
    dueStr ? `• *Due Date:* ${dueStr}` : null,
    opts.bankAccount
      ? `\n*Bank Transfer Details:*\n${opts.bankAccount.bank_name} · *${opts.bankAccount.account_number}*\nAccount Name: ${opts.bankAccount.account_name}`
      : null,
    opts.paymentUrl ? `\nPay / Upload Proof Online: ${opts.paymentUrl}` : null,
    opts.customNote ? `\n_Note: ${opts.customNote.trim()}_` : null,
    ``,
    `_Rillcod Technologies Finance Desk_`,
  ];

  return lines.filter(Boolean).join('\n');
}
