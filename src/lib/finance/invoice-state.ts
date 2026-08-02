export const OPEN_INVOICE_STATUSES = ['pending', 'sent', 'overdue', 'partially_paid'] as const;
export const CLOSED_INVOICE_STATUSES = ['paid', 'cancelled', 'void'] as const;

export const INVOICE_STATUSES = [
  'draft', 'pending', 'sent', 'partially_paid', 'paid', 'overdue', 'void', 'cancelled',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

const TRANSITIONS: Record<string, readonly string[]> = {
  draft: ['sent', 'pending', 'void', 'cancelled'],
  pending: ['sent', 'partially_paid', 'paid', 'overdue', 'void', 'cancelled'],
  sent: ['partially_paid', 'paid', 'overdue', 'void', 'cancelled'],
  partially_paid: ['partially_paid', 'paid', 'overdue', 'void', 'cancelled'],
  overdue: ['partially_paid', 'paid', 'void', 'cancelled'],
  paid: [],
  void: [],
  cancelled: [],
};

export function normalizeInvoiceStatus(status: unknown): string {
  return String(status ?? '').trim().toLowerCase();
}

export function isOpenInvoice(status: unknown): boolean {
  return (OPEN_INVOICE_STATUSES as readonly string[]).includes(normalizeInvoiceStatus(status));
}

export function isClosedInvoice(status: unknown): boolean {
  return (CLOSED_INVOICE_STATUSES as readonly string[]).includes(normalizeInvoiceStatus(status));
}

export function canTransitionInvoice(from: unknown, to: unknown): boolean {
  const current = normalizeInvoiceStatus(from);
  const next = normalizeInvoiceStatus(to);
  if (!current || !next) return false;
  if (current === next) return true;
  return (TRANSITIONS[current] ?? []).includes(next);
}

export function isOverdueInvoice(input: { status?: unknown; due_date?: unknown }, now = new Date()): boolean {
  if (normalizeInvoiceStatus(input.status) === 'overdue') return true;
  if (!isOpenInvoice(input.status) || !input.due_date) return false;
  const due = new Date(String(input.due_date));
  return !Number.isNaN(due.getTime()) && due.getTime() < now.getTime();
}

export function invoiceOutstandingAmount(input: {
  amount?: unknown;
  original_amount?: unknown;
  amount_paid?: unknown;
  paid_amount?: unknown;
  amount_remaining?: unknown;
}): number {
  if (input.amount_remaining != null && Number.isFinite(Number(input.amount_remaining))) {
    return Math.max(0, Number(input.amount_remaining));
  }
  const total = Math.max(0, Number(input.original_amount ?? input.amount ?? 0) || 0);
  const paid = Math.max(0, Number(input.amount_paid ?? input.paid_amount ?? 0) || 0);
  return Math.max(0, total - paid);
}

export function deriveInvoiceStatusFromBalances(input: {
  original_amount?: unknown;
  amount?: unknown;
  amount_paid?: unknown;
  amount_remaining?: unknown;
  current_status?: unknown;
}): InvoiceStatus {
  const remaining = invoiceOutstandingAmount(input);
  const paid = Math.max(0, Number(input.amount_paid ?? 0) || 0);
  if (remaining <= 0.01) return 'paid';
  if (paid > 0) return 'partially_paid';
  const cur = normalizeInvoiceStatus(input.current_status);
  if (cur === 'overdue' || cur === 'draft' || cur === 'sent' || cur === 'pending') return cur as InvoiceStatus;
  return 'sent';
}
