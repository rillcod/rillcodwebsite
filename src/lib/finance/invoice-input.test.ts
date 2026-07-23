import { describe, expect, it } from 'vitest';
import {
  calculateInvoiceItemsTotal,
  normalizeInvoiceItems,
  validateInvoiceInput,
} from './invoice-input';

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

describe('normalizeInvoiceItems', () => {
  it('accepts school commission and deposit credit lines', () => {
    const result = calculateInvoiceItemsTotal([
      { description: 'STEM programme', quantity: 10, unit_price: 25000, total: 250000 },
      { description: 'School Commission / Share (30%)', quantity: 1, unit_price: -75000, total: -75000 },
      { description: 'Less Previous Deposit / Payment', quantity: 1, unit_price: -20000, total: -20000 },
    ]);
    expect(result).toEqual({ ok: true, total: 155000 });
  });

  it('coerces legacy billing-cycle rollup rows', () => {
    const normalized = normalizeInvoiceItems([
      { description: 'STEM programme', quantity: 10, unit_price: 25000, total: 250000 },
      {
        invoice_id: 'inv-child-1',
        invoice_number: 'INV-2026-001',
        amount: 15000,
        student_name: 'Ada O.',
      },
    ]);
    expect(normalized.ok).toBe(true);
    if (normalized.ok) {
      expect(normalized.items[1]).toMatchObject({
        description: 'INV-2026-001 — Ada O.',
        quantity: 1,
        unit_price: 15000,
        total: 15000,
      });
    }
  });

  it('maps alternate price field names from stored JSON', () => {
    const normalized = normalizeInvoiceItems([
      { description: 'Line one', quantity: 2, unitPrice: 1000, total: 2000 },
      { description: 'Line two', qty: 1, price: 5000 },
    ]);
    expect(normalized.ok).toBe(true);
    if (normalized.ok) {
      expect(normalized.items[1]).toMatchObject({
        quantity: 1,
        unit_price: 5000,
        total: 5000,
      });
    }
  });
});
