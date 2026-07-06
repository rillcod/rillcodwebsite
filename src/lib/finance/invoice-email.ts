/**
 * Shared invoice email helpers — one place for line items, subjects, payment
 * URLs, and reminder/issue HTML so cron, staff remind, and send-invoice stay
 * visually and verbally consistent.
 */
import {
  buildInvoiceEmail,
  type InvoiceBankAccount,
  type InvoiceLineItem,
} from '@/lib/email/rillcod-transactional-email';

export type InvoiceReminderLevel = 1 | 2 | 3;

/** Minimal invoice shape shared by API routes and cron jobs. */
export type InvoiceEmailSource = {
  id?: string;
  invoice_number?: string | null;
  amount?: number | null;
  currency?: string | null;
  status?: string | null;
  due_date?: string | null;
  created_at?: string | null;
  items?: unknown;
  notes?: string | null;
  description?: string | null;
  school_id?: string | null;
  portal_user_id?: string | null;
  portal_users?: { full_name?: string; email?: string; school_id?: string | null } | null;
  schools?: { name?: string } | null;
};

const REMINDER_NOTES: Record<InvoiceReminderLevel, string> = {
  1: 'This is your invoice. Please settle before the due date to ensure uninterrupted access. Paid by bank transfer? Upload your proof of payment on the portal.',
  2: 'Payment is due soon. Please log in and settle your balance to avoid service interruption. Upload bank transfer receipts via your portal dashboard.',
  3: 'Your invoice is now OVERDUE. Immediate payment is required to prevent suspension of access. If already paid, please upload your receipt immediately.',
};

export function appBaseUrl(override?: string): string {
  return (override ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://rillcod.com').replace(/\/$/, '');
}

export function formatInvoiceDueDate(dueDate?: string | null): string {
  if (!dueDate) return 'N/A';
  return new Date(dueDate).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function resolveInvoiceNumber(invoice: InvoiceEmailSource): string {
  if (invoice.invoice_number) return invoice.invoice_number;
  const id = invoice.id ?? 'unknown';
  return `INV-${id.slice(0, 8).toUpperCase()}`;
}

export function resolveSchoolName(invoice: InvoiceEmailSource): string {
  return invoice.schools?.name ?? 'Rillcod Technologies';
}

/** Portal URL payers land on — school billing vs parent/learner invoices. */
export function defaultInvoicePaymentUrl(opts: {
  isSchool?: boolean;
  invoiceId?: string;
  appUrl?: string;
}): string {
  const base = appBaseUrl(opts.appUrl);
  if (opts.isSchool) return `${base}/dashboard/school-billing`;
  if (opts.invoiceId) return `${base}/dashboard/parent-invoices?invoice=${opts.invoiceId}`;
  return `${base}/dashboard/parent-invoices`;
}

/** Normalise stored invoice.items (or amount) into buildInvoiceEmail line rows. */
export function parseInvoiceLineItems(
  invoice: InvoiceEmailSource,
  opts?: { isSchool?: boolean; fallbackDescription?: string },
): InvoiceLineItem[] {
  const curr = invoice.currency || 'NGN';
  const raw = Array.isArray(invoice.items) ? (invoice.items as Record<string, unknown>[]) : [];
  const lineItems: InvoiceLineItem[] = raw.map((item) => ({
    description: String(item.description ?? opts?.fallbackDescription ?? 'Service'),
    qty: item.quantity != null ? Number(item.quantity) : undefined,
    unitPrice: Number(item.unit_price ?? item.amount ?? 0),
    currency: curr,
  }));

  if (lineItems.length === 0) {
    lineItems.push({
      description:
        opts?.fallbackDescription
        ?? invoice.description
        ?? (opts?.isSchool ? 'School Platform Fee' : 'Platform Fee'),
      unitPrice: Number(invoice.amount ?? 0),
      currency: curr,
    });
  }
  return lineItems;
}

export function invoiceReminderSubject(
  invoice: InvoiceEmailSource,
  level: InvoiceReminderLevel,
  schoolName?: string,
): string {
  const invoiceNumber = resolveInvoiceNumber(invoice);
  const dueDate = formatInvoiceDueDate(invoice.due_date);
  const school = schoolName ?? resolveSchoolName(invoice);

  switch (level) {
    case 1:
      return `Invoice ${invoiceNumber} from ${school} — Payment Due ${dueDate}`;
    case 2:
      return `Reminder: Invoice ${invoiceNumber} is Due Soon — ${dueDate}`;
    case 3:
      return `FINAL REMINDER: Invoice ${invoiceNumber} is Overdue — Action Required`;
  }
}

export function invoiceIssueSubject(invoice: InvoiceEmailSource, isSchool: boolean): string {
  const invoiceNumber = resolveInvoiceNumber(invoice);
  return isSchool
    ? `Invoice ${invoiceNumber} — Rillcod Technologies (School Billing)`
    : `Invoice ${invoiceNumber} from Rillcod Technologies`;
}

export type InvoiceReminderEmailResult = {
  html: string;
  subject: string;
  fromName: string;
};

/** Branded reminder email (levels 1–3) — used by cron and staff remind. */
export function buildInvoiceReminderEmail(
  invoice: InvoiceEmailSource,
  level: InvoiceReminderLevel,
  opts?: {
    paymentUrl?: string;
    appUrl?: string;
    bankAccounts?: InvoiceBankAccount[];
    isSchool?: boolean;
  },
): InvoiceReminderEmailResult {
  const student = invoice.portal_users;
  const schoolName = resolveSchoolName(invoice);
  const base = appBaseUrl(opts?.appUrl);
  const paymentUrl = opts?.paymentUrl ?? defaultInvoicePaymentUrl({
    isSchool: opts?.isSchool,
    invoiceId: invoice.id,
    appUrl: base,
  });

  const extraNotes = invoice.notes?.trim();
  const notes = extraNotes
    ? `${REMINDER_NOTES[level]}\n\n${extraNotes}`
    : REMINDER_NOTES[level];

  const html = buildInvoiceEmail({
    recipientName: student?.full_name ?? 'Student',
    invoiceNumber: resolveInvoiceNumber(invoice),
    issueDate: invoice.created_at || new Date().toISOString(),
    dueDate: invoice.due_date || new Date().toISOString(),
    items: parseInvoiceLineItems(invoice, { isSchool: opts?.isSchool }),
    currency: invoice.currency || 'NGN',
    notes,
    schoolName,
    isSchool: opts?.isSchool ?? false,
    paymentUrl,
    bankAccounts: opts?.bankAccounts,
    appUrl: base,
    reminderLevel: level,
  });

  return {
    html,
    subject: invoiceReminderSubject(invoice, level, schoolName),
    fromName: schoolName,
  };
}

/** Branded initial invoice email — used by staff send-invoice. */
export function buildInvoiceIssueEmail(
  invoice: InvoiceEmailSource,
  opts: {
    recipientName: string;
    isSchool: boolean;
    paymentUrl: string;
    bankAccounts?: InvoiceBankAccount[];
    appUrl?: string;
  },
): { html: string; subject: string } {
  const base = appBaseUrl(opts.appUrl);
  const html = buildInvoiceEmail({
    recipientName: opts.recipientName,
    invoiceNumber: resolveInvoiceNumber(invoice),
    issueDate: invoice.created_at || new Date().toISOString(),
    dueDate: invoice.due_date || new Date(Date.now() + 7 * 86400000).toISOString(),
    items: parseInvoiceLineItems(invoice, {
      isSchool: opts.isSchool,
      fallbackDescription: opts.isSchool ? 'School Platform Fee' : 'Platform Fee',
    }),
    currency: invoice.currency || 'NGN',
    isSchool: opts.isSchool,
    schoolName: opts.isSchool ? resolveSchoolName(invoice) : undefined,
    bankAccounts: opts.bankAccounts,
    paymentUrl: opts.paymentUrl,
    appUrl: base,
  });

  return {
    html,
    subject: invoiceIssueSubject(invoice, opts.isSchool),
  };
}
