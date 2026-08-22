import type { SupabaseClient } from '@supabase/supabase-js';

export type InvoicePaymentAccount = {
  id?: string;
  label?: string | null;
  bank_name: string;
  account_number: string;
  account_name: string;
  payment_note?: string | null;
  is_active?: boolean;
};

export type InvoicePaymentAccountSnapshot = InvoicePaymentAccount & {
  id: string;
  captured_at: string;
};

type InvoiceAccountReference = {
  metadata?: Record<string, unknown> | null;
};

function paymentAccountSnapshot(invoice: InvoiceAccountReference): InvoicePaymentAccountSnapshot | null {
  const raw = invoice.metadata?.payment_account_snapshot;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const bankName = typeof value.bank_name === 'string' ? value.bank_name.trim() : '';
  const accountNumber = typeof value.account_number === 'string' ? value.account_number.trim() : '';
  const accountName = typeof value.account_name === 'string' ? value.account_name.trim() : '';
  if (!id || !bankName || !accountNumber || !accountName) return null;
  return {
    id,
    bank_name: bankName,
    account_number: accountNumber,
    account_name: accountName,
    label: typeof value.label === 'string' ? value.label : null,
    payment_note: typeof value.payment_note === 'string' ? value.payment_note : null,
    is_active: true,
    captured_at: typeof value.captured_at === 'string' ? value.captured_at : '',
  };
}

function snapshotAccount(account: InvoicePaymentAccount, capturedAt = new Date().toISOString()): InvoicePaymentAccountSnapshot {
  if (!account.id) throw new Error('The selected payment account has no stable identifier.');
  return {
    id: account.id,
    label: account.label ?? null,
    bank_name: account.bank_name,
    account_number: account.account_number,
    account_name: account.account_name,
    payment_note: account.payment_note ?? null,
    is_active: true,
    captured_at: capturedAt,
  };
}

/**
 * Merge invoice metadata and capture the exact active account that will appear
 * on the issued document. The client may select an account ID, but it can never
 * supply or alter the bank details stored in the snapshot.
 */
export async function prepareInvoicePaymentMetadata(
  db: SupabaseClient,
  metadata: Record<string, unknown> | null | undefined,
): Promise<Record<string, unknown>> {
  const next = { ...(metadata ?? {}) };
  delete next.payment_account_snapshot;

  const method = typeof next.payment_method === 'string' && next.payment_method.trim()
    ? next.payment_method.trim()
    : 'bank_transfer';
  next.payment_method = method;

  if (method !== 'bank_transfer') {
    delete next.pay_to_account_id;
    return next;
  }

  const selectedId = typeof next.pay_to_account_id === 'string'
    ? next.pay_to_account_id.trim()
    : '';
  const columns = 'id, label, bank_name, account_number, account_name, payment_note, is_active';
  let account: InvoicePaymentAccount | null = null;

  if (selectedId) {
    const { data, error } = await db
      .from('payment_accounts')
      .select(columns)
      .eq('id', selectedId)
      .eq('owner_type', 'rillcod')
      .maybeSingle();
    if (error) throw new Error(`Selected payment account could not be loaded: ${error.message}`);
    if (!data) throw new Error('The selected payment account no longer exists. Choose an active account before saving.');
    if (data.is_active === false) throw new Error('The selected payment account is inactive. Choose an active account before saving.');
    account = data as InvoicePaymentAccount;
  } else {
    const { data, error } = await db
      .from('payment_accounts')
      .select(columns)
      .eq('owner_type', 'rillcod')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Payment account could not be loaded: ${error.message}`);
    account = data as InvoicePaymentAccount | null;
  }

  if (!account) {
    throw new Error('No active Rillcod payment account is available. Add one before issuing this bank-transfer invoice.');
  }
  const snapshot = snapshotAccount(account);
  next.pay_to_account_id = snapshot.id;
  next.payment_account_snapshot = snapshot;
  return next;
}

/**
 * Prepare an invoice correction without allowing browser metadata to replace an
 * already-issued account snapshot. Unrelated edits retain the trusted snapshot;
 * an explicit payment-method/account change resolves a fresh server snapshot.
 */
export async function prepareUpdatedInvoicePaymentMetadata(
  db: SupabaseClient,
  existingMetadata: Record<string, unknown> | null | undefined,
  metadataPatch: Record<string, unknown> | null | undefined,
): Promise<Record<string, unknown>> {
  const existing = { ...(existingMetadata ?? {}) };
  const patch = { ...(metadataPatch ?? {}) };
  const merged = { ...existing, ...patch };
  const paymentSelectionChanged = Object.prototype.hasOwnProperty.call(patch, 'payment_method')
    || Object.prototype.hasOwnProperty.call(patch, 'pay_to_account_id');
  const trustedSnapshot = paymentAccountSnapshot({ metadata: existing });

  if (!paymentSelectionChanged && trustedSnapshot) {
    merged.payment_method = typeof existing.payment_method === 'string'
      ? existing.payment_method
      : 'bank_transfer';
    merged.pay_to_account_id = trustedSnapshot.id;
    merged.payment_account_snapshot = existing.payment_account_snapshot;
    return merged;
  }

  return prepareInvoicePaymentMetadata(db, merged);
}

/**
 * Resolve payment instructions from the invoice's selected account first.
 * The fallback is the current active Rillcod collection accounts. Keeping this
 * in one server helper makes PDF, email, resend, and reminder output agree.
 */
export async function loadInvoicePaymentAccounts(
  db: SupabaseClient,
  invoice: InvoiceAccountReference,
  limit = 3,
): Promise<InvoicePaymentAccount[]> {
  const snapshot = paymentAccountSnapshot(invoice);
  if (snapshot) return [snapshot];

  const selectedId =
    typeof invoice.metadata?.pay_to_account_id === 'string'
      ? invoice.metadata.pay_to_account_id.trim()
      : '';
  const columns = 'id, label, bank_name, account_number, account_name, payment_note, is_active';

  if (selectedId) {
    const { data, error } = await db
      .from('payment_accounts')
      .select(columns)
      .eq('id', selectedId)
      .maybeSingle();
    if (error) throw new Error(`Selected payment account could not be loaded: ${error.message}`);
    if (!data) throw new Error('The payment account selected on this invoice no longer exists. Edit the invoice and choose an active account.');
    if (data.is_active === false) {
      throw new Error('The payment account selected on this invoice is inactive. Edit the invoice and choose an active account.');
    }
    return [data as InvoicePaymentAccount];
  }

  const { data, error } = await db
    .from('payment_accounts')
    .select(columns)
    .eq('owner_type', 'rillcod')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 3)));
  if (error) throw new Error(`Payment accounts could not be loaded: ${error.message}`);
  return (data ?? []) as InvoicePaymentAccount[];
}
