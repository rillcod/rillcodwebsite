import { describe, expect, it, vi } from 'vitest';
import { loadInvoicePaymentAccounts } from './invoice-payment-accounts';

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
