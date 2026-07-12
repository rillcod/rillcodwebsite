import { calculateInvoiceItemsTotal } from '@/lib/finance/invoice-input';
import { classifyInvoiceStream } from '@/lib/finance/streams';
import { financeFail, financeOk, type FinanceWriteResult } from '@/lib/finance/write-result';
import { toJson } from '@/lib/supabase/json';

type FinanceDb = { from: (table: string) => any };

export async function ensureSettledInvoiceForTransaction(
  db: FinanceDb,
  input: {
    transactionId: string;
    invoiceNumber: string;
    amount: number;
    currency?: string;
    schoolId?: string | null;
    portalUserId?: string | null;
    items: unknown[];
    metadata?: Record<string, unknown>;
  },
): Promise<FinanceWriteResult<Record<string, unknown>>> {
  const { data: transaction, error: transactionError } = await db.from('payment_transactions')
    .select('id, invoice_id, amount, currency, payment_status')
    .eq('id', input.transactionId)
    .maybeSingle();
  if (transactionError) return financeFail('db_error', transactionError.message);
  if (!transaction) return financeFail('not_found', 'Payment transaction not found');
  if (!['completed', 'success', 'paid'].includes(String(transaction.payment_status || '').toLowerCase())) {
    return financeFail('invalid_transition', 'Only a completed payment can produce a settled invoice');
  }
  if (transaction.invoice_id) {
    const { data: existing, error: existingError } = await db.from('invoices').select('*').eq('id', transaction.invoice_id).maybeSingle();
    if (existingError) return financeFail('db_error', existingError.message);
    if (existing) return financeOk(existing as Record<string, unknown>, ['settled_invoice_reused']);
  }

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return financeFail('validation', 'Settled invoice amount must be greater than zero');
  if (Math.abs(amount - Number(transaction.amount || 0)) > 0.01) return financeFail('validation', 'Settled invoice amount does not match payment amount');
  const currency = String(input.currency || transaction.currency || 'NGN').toUpperCase();
  if (String(transaction.currency || 'NGN').toUpperCase() !== currency) return financeFail('validation', 'Settled invoice currency does not match payment currency');
  const itemCheck = calculateInvoiceItemsTotal(input.items);
  if (!itemCheck.ok) return financeFail('validation', itemCheck.error);
  if (Math.abs(itemCheck.total - amount) > 0.01) return financeFail('validation', 'Settled invoice items do not match payment amount');

  const { data: invoice, error: invoiceError } = await db.from('invoices').insert({
    invoice_number: input.invoiceNumber,
    amount,
    original_amount: amount,
    amount_paid: amount,
    amount_remaining: 0,
    currency,
    status: 'paid',
    due_date: null,
    portal_user_id: input.portalUserId ?? null,
    school_id: input.schoolId ?? null,
    payment_transaction_id: input.transactionId,
    items: toJson(input.items),
    metadata: toJson(input.metadata ?? {}),
    stream: classifyInvoiceStream({ school_id: input.schoolId ?? null, portal_user_id: input.portalUserId ?? null, metadata: input.metadata ?? {} }),
  }).select().single();
  if (invoiceError) {
    if (invoiceError.code === '23505') return financeFail('conflict', 'A settled invoice already exists for this payment');
    return financeFail('db_error', invoiceError.message);
  }
  if (!invoice) return financeFail('db_error', 'Settled invoice insert returned no row');

  const { error: linkError } = await db.from('payment_transactions')
    .update({ invoice_id: invoice.id, updated_at: new Date().toISOString() })
    .eq('id', input.transactionId)
    .is('invoice_id', null);
  if (linkError) {
    await db.from('invoices').delete().eq('id', invoice.id).eq('payment_transaction_id', input.transactionId);
    return financeFail('db_error', 'Could not link settled invoice to payment: ' + linkError.message);
  }
  return financeOk(invoice as Record<string, unknown>, ['settled_invoice_created', 'payment_invoice_linked']);
}
