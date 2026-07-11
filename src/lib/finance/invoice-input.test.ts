import { describe, expect, it } from 'vitest';
import { validateInvoiceInput } from './invoice-input';

describe('validateInvoiceInput', () => {
  it('normalizes valid invoice input', () => {
    expect(validateInvoiceInput({ amount: '2500', currency: 'ngn', status: 'sent', items: [] })).toMatchObject({ ok: true, amount: 2500, currency: 'NGN', status: 'sent' });
  });
  it('rejects zero, negative, and nonnumeric amounts', () => {
    expect(validateInvoiceInput({ amount: 0 }).ok).toBe(false);
    expect(validateInvoiceInput({ amount: -1 }).ok).toBe(false);
    expect(validateInvoiceInput({ amount: 'no' }).ok).toBe(false);
  });
  it('prevents callers from creating pre-paid invoices', () => {
    expect(validateInvoiceInput({ amount: 100, status: 'paid' })).toEqual({ ok: false, error: expect.stringContaining('status') });
  });
  it('rejects invalid dates and item shapes', () => {
    expect(validateInvoiceInput({ amount: 100, due_date: 'not-a-date' }).ok).toBe(false);
    expect(validateInvoiceInput({ amount: 100, items: {} }).ok).toBe(false);
  });
});