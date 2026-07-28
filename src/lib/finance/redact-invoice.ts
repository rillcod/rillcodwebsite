import { roleHasCapability } from '@/lib/auth/capabilities';
import { classifyInvoiceStream } from '@/lib/finance/streams';

/**
 * Money redaction for partner-school eyes.
 *
 * Rillcod bills a partner school one price and bills that school's families another;
 * the difference is Rillcod's margin. So a school account may see:
 *   • its OWN invoices from Rillcod, in full          (stream = 'school')
 *   • WHETHER a family has paid                        (status indicator only)
 * and must not see:
 *   • what that family was charged or has paid         (any figure)
 *   • the payer's contact details or line items
 *
 * The invoices API previously scoped a school by `school_id` alone and never looked at
 * `stream`, so a family invoice that happened to carry a school_id was returned in full
 * — amounts, line items, and the payer's name and email via the portal_users join.
 */

export type InvoiceLike = Record<string, any>;

/**
 * Roles whose queries are ALREADY restricted to their own records.
 *
 * A parent sees invoices billed to their own children; a student sees their own.
 * They are not staff browsing other people's money, so redaction must not touch them
 * — stripping figures here would hide a family's own bill from them, and dropping the
 * row would empty their payment history entirely.
 */
const SELF_SCOPED_ROLES = new Set(['parent', 'student']);

/**
 * Family money, or the school's own bill from Rillcod?
 *
 * Defers to the canonical `classifyInvoiceStream` so there is one classifier — with
 * one deliberate difference. That function resolves an ambiguous legacy row TOWARD
 * 'school' (correct when totalling revenue: an unclassified row with a school_id is
 * most likely school billing). For DISCLOSURE the safe default is the opposite: if a
 * row names an individual payer, treat it as family money unless it explicitly says
 * otherwise. Guessing wrong here shows a parent's figures to their school.
 */
export function isSchoolStreamInvoice(invoice: InvoiceLike | null | undefined): boolean {
  if (!invoice) return false;
  if (invoice.stream === 'school') return true;
  if (invoice.stream === 'individual') return false;
  if (invoice.portal_user_id) return false;
  return classifyInvoiceStream(invoice as any) === 'school';
}

/** Paid / part-paid / unpaid, derived without exposing any figure. */
export function paymentStatusIndicator(invoice: InvoiceLike): 'paid' | 'part_paid' | 'unpaid' {
  const status = String(invoice.status ?? '').toLowerCase();
  if (status === 'paid' || status === 'settled') return 'paid';
  const remaining = Number(invoice.amount_remaining ?? 0);
  const paid = Number(invoice.amount_paid ?? 0);
  if (paid > 0 && remaining > 0) return 'part_paid';
  if (paid > 0 && remaining <= 0) return 'paid';
  return 'unpaid';
}

const MONEY_FIELDS = [
  'amount', 'original_amount', 'amount_paid', 'amount_remaining',
  'currency', 'items', 'notes', 'payment_link', 'metadata',
  'payment_transaction_id', 'invoice_number',
] as const;

/**
 * Strip every figure from a family invoice, keeping the paid/unpaid signal a school
 * legitimately needs. Returns the invoice untouched when the viewer is entitled to
 * the figures, or when it is the school's own bill.
 */
export function redactInvoiceForRole(
  invoice: InvoiceLike | null | undefined,
  role: string | null | undefined,
): InvoiceLike | null {
  if (!invoice) return null;
  if (role && SELF_SCOPED_ROLES.has(role)) return invoice;
  if (roleHasCapability(role, 'view_student_finance')) return invoice;
  if (isSchoolStreamInvoice(invoice)) return invoice;
  if (!roleHasCapability(role, 'view_student_payment_status')) return null;

  const redacted: InvoiceLike = { ...invoice };
  for (const field of MONEY_FIELDS) delete redacted[field];
  // The joined payer record carries the family's name and email.
  delete redacted.portal_users;

  redacted.payment_status = paymentStatusIndicator(invoice);
  redacted.amounts_hidden = true;
  return redacted;
}

/**
 * Same rule for money that has actually moved.
 *
 * `payment_transactions` has no `stream` column, so a family payment is identified by
 * its individual payer — or by the invoice it settles, when that invoice is joined.
 * Routes scoped a school by `school_id` alone, so family payments carrying a school_id
 * came back with the amount and the payer's name and email.
 */
const TX_MONEY_FIELDS = [
  'amount', 'currency', 'payment_gateway_response', 'receipt_url',
  'transaction_reference', 'external_transaction_id', 'refund_reason',
] as const;

export function isSchoolStreamTransaction(tx: InvoiceLike | null | undefined): boolean {
  if (!tx) return false;
  // A joined invoice is the stronger signal — trust it over the payer column.
  const invoice = tx.invoices ?? tx.invoice ?? null;
  if (invoice) return isSchoolStreamInvoice(invoice);
  return !tx.portal_user_id && !!tx.school_id;
}

export function redactTransactionForRole(
  tx: InvoiceLike | null | undefined,
  role: string | null | undefined,
): InvoiceLike | null {
  if (!tx) return null;
  if (role && SELF_SCOPED_ROLES.has(role)) return tx;
  if (roleHasCapability(role, 'view_student_finance')) return tx;
  if (isSchoolStreamTransaction(tx)) return tx;
  if (!roleHasCapability(role, 'view_student_payment_status')) return null;

  const redacted: InvoiceLike = { ...tx };
  for (const field of TX_MONEY_FIELDS) delete redacted[field];
  delete redacted.portal_users;
  delete redacted.invoices;

  redacted.payment_status_indicator =
    String(tx.payment_status ?? '').toLowerCase() === 'completed'
    || String(tx.payment_status ?? '').toLowerCase() === 'success'
    || String(tx.payment_status ?? '').toLowerCase() === 'paid'
      ? 'paid'
      : 'unpaid';
  redacted.amounts_hidden = true;
  return redacted;
}

export function redactTransactionListForRole(
  transactions: InvoiceLike[] | null | undefined,
  role: string | null | undefined,
): InvoiceLike[] {
  return (transactions ?? [])
    .map((tx) => redactTransactionForRole(tx, role))
    .filter((tx): tx is InvoiceLike => tx !== null);
}

/** List variant — drops rows the viewer may not see at all. */
export function redactInvoiceListForRole(
  invoices: InvoiceLike[] | null | undefined,
  role: string | null | undefined,
): InvoiceLike[] {
  return (invoices ?? [])
    .map((invoice) => redactInvoiceForRole(invoice, role))
    .filter((invoice): invoice is InvoiceLike => invoice !== null);
}
