import { describe, expect, it, vi } from 'vitest';
import {
  loadInvoicePaymentAccounts,
  prepareInvoicePaymentMetadata,
  prepareUpdatedInvoicePaymentMetadata,
} from './invoice-payment-accounts';

const selectedAccount = {
  id: 'account-1',
  label: 'Collections',
  bank_name: 'Test Bank',
  account_number: '0123456789',
  account_name: 'Rillcod Technologies',
  payment_note: null,
  is_active: true,
};

function selectedAccountDb(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eqId = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq: eqId }));
  return {
    db: { from: vi.fn(() => ({ select })) },
    select,
    eqId,
  };
}

function fallbackAccountDb(result: { data: unknown; error: unknown }) {
  const limit = vi.fn().mockResolvedValue(result);
  const order = vi.fn(() => ({ limit }));
  const eqActive = vi.fn(() => ({ order }));
  const eqOwner = vi.fn(() => ({ eq: eqActive }));
  const select = vi.fn(() => ({ eq: eqOwner }));
  return {
    db: { from: vi.fn(() => ({ select })) },
    eqOwner,
    eqActive,
    limit,
  };
}

describe('loadInvoicePaymentAccounts', () => {
  it('uses the immutable issued snapshot without querying mutable account settings', async () => {
    const db = { from: vi.fn() };
    const snapshot = {
      ...selectedAccount,
      captured_at: '2026-08-22T12:00:00.000Z',
    };

    const accounts = await loadInvoicePaymentAccounts(db as any, {
      metadata: { payment_account_snapshot: snapshot },
    });

    expect(accounts).toEqual([snapshot]);
    expect(db.from).not.toHaveBeenCalled();
  });

  it('loads the exact account selected on the invoice', async () => {
    const { db, eqId } = selectedAccountDb({ data: selectedAccount, error: null });

    const accounts = await loadInvoicePaymentAccounts(db as any, {
      metadata: { pay_to_account_id: 'account-1' },
    });

    expect(accounts).toEqual([selectedAccount]);
    expect(eqId).toHaveBeenCalledWith('id', 'account-1');
  });

  it('rejects an inactive selected account instead of publishing stale instructions', async () => {
    const { db } = selectedAccountDb({
      data: { ...selectedAccount, is_active: false },
      error: null,
    });

    await expect(
      loadInvoicePaymentAccounts(db as any, { metadata: { pay_to_account_id: 'account-1' } }),
    ).rejects.toThrow('inactive');
  });

  it('falls back to active Rillcod accounts for legacy invoices', async () => {
    const { db, eqOwner, eqActive, limit } = fallbackAccountDb({
      data: [selectedAccount],
      error: null,
    });

    const accounts = await loadInvoicePaymentAccounts(db as any, { metadata: {} }, 10);

    expect(accounts).toEqual([selectedAccount]);
    expect(eqOwner).toHaveBeenCalledWith('owner_type', 'rillcod');
    expect(eqActive).toHaveBeenCalledWith('is_active', true);
    expect(limit).toHaveBeenCalledWith(3);
  });

  it('surfaces database failures instead of silently omitting bank details', async () => {
    const { db } = fallbackAccountDb({ data: null, error: { message: 'database unavailable' } });

    await expect(loadInvoicePaymentAccounts(db as any, { metadata: null })).rejects.toThrow(
      'database unavailable',
    );
  });
});

describe('prepareInvoicePaymentMetadata', () => {
  it('captures trusted account details while preserving unrelated metadata', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: selectedAccount, error: null });
    const eqOwner = vi.fn(() => ({ maybeSingle }));
    const eqId = vi.fn(() => ({ eq: eqOwner }));
    const select = vi.fn(() => ({ eq: eqId }));
    const db = { from: vi.fn(() => ({ select })) };

    const metadata = await prepareInvoicePaymentMetadata(db as any, {
      academic_year: '2026/2027',
      payment_method: 'bank_transfer',
      pay_to_account_id: selectedAccount.id,
      payment_account_snapshot: { account_number: 'client supplied' },
    });

    expect(metadata.academic_year).toBe('2026/2027');
    expect(eqOwner).toHaveBeenCalledWith('owner_type', 'rillcod');
    expect(metadata.pay_to_account_id).toBe(selectedAccount.id);
    expect(metadata.payment_account_snapshot).toMatchObject({
      id: selectedAccount.id,
      bank_name: selectedAccount.bank_name,
      account_number: selectedAccount.account_number,
      account_name: selectedAccount.account_name,
    });
    expect((metadata.payment_account_snapshot as any).account_number).not.toBe('client supplied');
  });

  it('removes bank instructions for a non-transfer payment method', async () => {
    const db = { from: vi.fn() };
    const metadata = await prepareInvoicePaymentMetadata(db as any, {
      payment_method: 'online',
      pay_to_account_id: selectedAccount.id,
      payment_account_snapshot: selectedAccount,
    });

    expect(metadata).toEqual({ payment_method: 'online' });
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe('prepareUpdatedInvoicePaymentMetadata', () => {
  const issuedSnapshot = {
    ...selectedAccount,
    captured_at: '2026-08-22T12:00:00.000Z',
  };

  it('preserves the trusted issued snapshot for unrelated corrections', async () => {
    const db = { from: vi.fn() };

    const metadata = await prepareUpdatedInvoicePaymentMetadata(
      db as any,
      {
        payment_method: 'bank_transfer',
        pay_to_account_id: selectedAccount.id,
        payment_account_snapshot: issuedSnapshot,
        term_label: 'First Term',
      },
      {
        term_label: 'First Term — corrected',
        payment_account_snapshot: { account_number: 'forged' },
      },
    );

    expect(metadata.term_label).toBe('First Term — corrected');
    expect(metadata.payment_account_snapshot).toEqual(issuedSnapshot);
    expect(db.from).not.toHaveBeenCalled();
  });

  it('resolves a new trusted snapshot when the payment destination changes', async () => {
    const replacement = { ...selectedAccount, id: 'account-2', account_number: '9999999999' };
    const maybeSingle = vi.fn().mockResolvedValue({ data: replacement, error: null });
    const eqOwner = vi.fn(() => ({ maybeSingle }));
    const eqId = vi.fn(() => ({ eq: eqOwner }));
    const select = vi.fn(() => ({ eq: eqId }));
    const db = { from: vi.fn(() => ({ select })) };

    const metadata = await prepareUpdatedInvoicePaymentMetadata(
      db as any,
      {
        payment_method: 'bank_transfer',
        pay_to_account_id: selectedAccount.id,
        payment_account_snapshot: issuedSnapshot,
      },
      { pay_to_account_id: replacement.id },
    );

    expect(eqId).toHaveBeenCalledWith('id', replacement.id);
    expect(metadata.payment_account_snapshot).toMatchObject({
      id: replacement.id,
      account_number: replacement.account_number,
    });
  });
});
