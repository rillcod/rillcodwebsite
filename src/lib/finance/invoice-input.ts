export const CREATABLE_INVOICE_STATUSES = ['draft', 'pending', 'sent'] as const;
export const SUPPORTED_INVOICE_CURRENCIES = ['NGN', 'USD'] as const;

export type InvoiceInputResult =
  | { ok: true; amount: number; currency: string; status: string; dueDate: string | null; items: unknown[] }
  | { ok: false; error: string };

export type InvoiceItemsResult =
  | { ok: true; total: number }
  | { ok: false; error: string };

export function calculateInvoiceItemsTotal(items: unknown): InvoiceItemsResult {
  if (!Array.isArray(items) || items.length === 0) return { ok: false, error: 'items must contain at least one line' };
  let total = 0;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { ok: false, error: `Invoice line ${index + 1} must be an object` };
    const row = item as Record<string, unknown>;
    const quantity = Number(row.quantity ?? 1);
    const unitPrice = Number(row.unit_price ?? 0);
    const lineTotal = row.total == null ? quantity * unitPrice : Number(row.total);
    if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, error: `Invoice line ${index + 1} quantity must be greater than zero` };
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(lineTotal) || lineTotal < 0) return { ok: false, error: `Invoice line ${index + 1} contains an invalid price or total` };
    if (Math.abs(lineTotal - quantity * unitPrice) > 0.01) return { ok: false, error: `Invoice line ${index + 1} total does not equal quantity × unit price` };
    total += lineTotal;
  }
  if (!Number.isFinite(total) || total <= 0) return { ok: false, error: 'Invoice line total must be greater than zero' };
  return { ok: true, total };
}

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