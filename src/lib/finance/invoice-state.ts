export const OPEN_INVOICE_STATUSES = ['pending', 'sent', 'overdue', 'partially_paid'] as const;
export const CLOSED_INVOICE_STATUSES = ['paid', 'cancelled', 'void'] as const;

export function normalizeInvoiceStatus(status: unknown): string {
  return String(status ?? '').trim().toLowerCase();
}

export function isOpenInvoice(status: unknown): boolean {
  return (OPEN_INVOICE_STATUSES as readonly string[]).includes(normalizeInvoiceStatus(status));
}

export function isClosedInvoice(status: unknown): boolean {
  return (CLOSED_INVOICE_STATUSES as readonly string[]).includes(normalizeInvoiceStatus(status));
}

export function isOverdueInvoice(input: { status?: unknown; due_date?: unknown }, now = new Date()): boolean {
  if (normalizeInvoiceStatus(input.status) === 'overdue') return true;
  if (!isOpenInvoice(input.status) || !input.due_date) return false;
  const due = new Date(String(input.due_date));
  return !Number.isNaN(due.getTime()) && due.getTime() < now.getTime();
}

export function invoiceOutstandingAmount(input: { amount?: unknown; amount_paid?: unknown; paid_amount?: unknown }): number {
  const total = Math.max(0, Number(input.amount ?? 0) || 0);
  const paid = Math.max(0, Number(input.amount_paid ?? input.paid_amount ?? 0) || 0);
  return Math.max(0, total - paid);
}