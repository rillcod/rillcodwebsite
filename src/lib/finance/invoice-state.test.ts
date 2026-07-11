import { describe, expect, it } from 'vitest';
import { invoiceOutstandingAmount, isClosedInvoice, isOpenInvoice, isOverdueInvoice } from './invoice-state';

describe('canonical invoice state', () => {
  it('shares one open and closed vocabulary', () => {
    expect(isOpenInvoice('partially_paid')).toBe(true);
    expect(isOpenInvoice('draft')).toBe(false);
    expect(isClosedInvoice('VOID')).toBe(true);
  });
  it('calculates remaining invoice amount without going below zero', () => {
    expect(invoiceOutstandingAmount({ amount: 50000, amount_paid: 20000 })).toBe(30000);
    expect(invoiceOutstandingAmount({ amount: 50000, paid_amount: 60000 })).toBe(0);
  });
  it('derives overdue only for open invoices', () => {
    const now = new Date('2026-07-11T00:00:00Z');
    expect(isOverdueInvoice({ status: 'sent', due_date: '2026-07-01' }, now)).toBe(true);
    expect(isOverdueInvoice({ status: 'paid', due_date: '2026-07-01' }, now)).toBe(false);
  });
});