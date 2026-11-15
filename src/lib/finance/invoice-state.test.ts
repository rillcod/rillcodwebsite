import { describe, expect, it } from 'vitest';
import {
  canTransitionInvoice,
  invoiceOutstandingAmount,
  invoiceOverpaidAmount,
  isClosedInvoice,
  isOpenInvoice,
  isOverdueInvoice,
} from './invoice-state';

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
  it('captures overpaid credit when paid amount exceeds invoice total or metadata stores credit', () => {
    expect(invoiceOverpaidAmount({ amount: 50000, amount_paid: 50000 })).toBe(0);
    expect(invoiceOverpaidAmount({ amount: 50000, paid_amount: 65000 })).toBe(15000);
    expect(
      invoiceOverpaidAmount({
        amount: 50000,
        amount_paid: 50000,
        metadata: { overpayment_credit: 12500 },
      }),
    ).toBe(12500);
  });
  it('derives overdue only for open invoices', () => {
    const now = new Date('2026-07-11T00:00:00Z');
    expect(isOverdueInvoice({ status: 'sent', due_date: '2026-07-01' }, now)).toBe(true);
    expect(isOverdueInvoice({ status: 'paid', due_date: '2026-07-01' }, now)).toBe(false);
  });
  it('never voids a paid invoice outside the refund workflow', () => {
    expect(canTransitionInvoice('paid', 'void')).toBe(false);
    expect(canTransitionInvoice('paid', 'paid')).toBe(true);
    expect(canTransitionInvoice('sent', 'paid')).toBe(true);
  });

});