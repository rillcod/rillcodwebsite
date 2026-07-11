export const CREATABLE_INVOICE_STATUSES = ['draft', 'pending', 'sent'] as const;
export const SUPPORTED_INVOICE_CURRENCIES = ['NGN', 'USD'] as const;

export type InvoiceInputResult =
  | { ok: true; amount: number; currency: string; status: string; dueDate: string | null; items: unknown[] }
  | { ok: false; error: string };

export function validateInvoiceInput(input: { amount?: unknown; currency?: unknown; status?: unknown; due_date?: unknown; items?: unknown }): InvoiceInputResult {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: 'amount must be a positive number' };

  const currency = String(input.currency || 'NGN').trim().toUpperCase();
  if (!(SUPPORTED_INVOICE_CURRENCIES as readonly string[]).includes(currency)) {
    return { ok: false, error: `currency must be one of: ${SUPPORTED_INVOICE_CURRENCIES.join(', ')}` };
  }

  const status = String(input.status || 'sent').trim().toLowerCase();
  if (!(CREATABLE_INVOICE_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: `status must be one of: ${CREATABLE_INVOICE_STATUSES.join(', ')}` };
  }

  const dueDate = input.due_date == null || input.due_date === '' ? null : String(input.due_date);
  if (dueDate && Number.isNaN(new Date(dueDate).getTime())) return { ok: false, error: 'due_date must be a valid date' };
  if (input.items != null && !Array.isArray(input.items)) return { ok: false, error: 'items must be an array' };

  return { ok: true, amount, currency, status, dueDate, items: Array.isArray(input.items) ? input.items : [] };
}