export const CREATABLE_INVOICE_STATUSES = ['draft', 'pending', 'sent'] as const;
export const SUPPORTED_INVOICE_CURRENCIES = ['NGN', 'USD'] as const;

export type InvoiceInputResult =
  | { ok: true; amount: number; currency: string; status: string; dueDate: string | null; items: unknown[] }
  | { ok: false; error: string };

export type InvoiceItemsResult =
  | { ok: true; total: number }
  | { ok: false; error: string };

export type NormalizedInvoiceLineItem = {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
};

function readNumeric(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Coerce stored/synced line items into the canonical invoice shape. */
export function normalizeInvoiceLineItem(
  raw: unknown,
  index: number,
): NormalizedInvoiceLineItem | { error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: `Invoice line ${index + 1} must be an object` };
  }

  const row = raw as Record<string, unknown>;

  // Legacy billing-cycle rollups: { invoice_id, invoice_number, amount, student_name, ... }
  if (row.invoice_id != null && readNumeric(row.unit_price ?? row.unitPrice) == null) {
    const amount = readNumeric(row.amount);
    if (amount == null) {
      return { error: `Invoice line ${index + 1} contains an invalid price or total` };
    }
    const label = [row.invoice_number, row.student_name].filter(Boolean).join(' — ')
      || `Included invoice ${index + 1}`;
    return {
      description: String(label),
      quantity: 1,
      unit_price: amount,
      total: amount,
    };
  }

  const quantity = readNumeric(row.quantity ?? row.qty) ?? 1;
  const explicitTotal = readNumeric(row.total ?? row.line_total);
  const unitPrice =
    readNumeric(row.unit_price ?? row.unitPrice ?? row.price ?? row.rate) ??
    (explicitTotal != null && quantity > 0 ? explicitTotal / quantity : null);
  const lineTotal =
    explicitTotal ??
    (unitPrice != null ? quantity * unitPrice : readNumeric(row.amount));

  const description = String(row.description ?? row.label ?? row.name ?? '').trim() || `Line ${index + 1}`;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { error: `Invoice line ${index + 1} quantity must be greater than zero` };
  }
  if (unitPrice == null || lineTotal == null) {
    return { error: `Invoice line ${index + 1} contains an invalid price or total` };
  }

  return {
    description,
    quantity,
    unit_price: unitPrice,
    total: lineTotal,
  };
}

export function normalizeInvoiceItems(
  items: unknown,
): { ok: true; items: NormalizedInvoiceLineItem[] } | { ok: false; error: string } {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'items must contain at least one line' };
  }

  const normalized: NormalizedInvoiceLineItem[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const result = normalizeInvoiceLineItem(items[index], index);
    if ('error' in result) return { ok: false, error: result.error };
    normalized.push(result);
  }
  return { ok: true, items: normalized };
}

export function calculateInvoiceItemsTotal(items: unknown): InvoiceItemsResult {
  const normalized = normalizeInvoiceItems(items);
  if (!normalized.ok) return normalized;

  let total = 0;
  for (let index = 0; index < normalized.items.length; index += 1) {
    const line = normalized.items[index];
    const { quantity, unit_price: unitPrice, total: lineTotal } = line;
    // Credits (commission share, deposits) may be negative; net total must still be positive.
    if (Math.abs(lineTotal - quantity * unitPrice) > 0.01) {
      return { ok: false, error: `Invoice line ${index + 1} total does not equal quantity × unit price` };
    }
    total += lineTotal;
  }

  if (!Number.isFinite(total) || total <= 0) {
    return { ok: false, error: 'Invoice line total must be greater than zero' };
  }

  return { ok: true, total: Math.round(total * 100) / 100 };
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
