import { describe, expect, it } from 'vitest';
import {
  isSchoolStreamInvoice,
  paymentStatusIndicator,
  redactInvoiceForRole,
  redactInvoiceListForRole,
  redactTransactionForRole,
  redactTransactionListForRole,
} from './redact-invoice';

/**
 * The commercial rule: Rillcod bills a partner school one price and that school's
 * families another. The gap is Rillcod's margin, so a school may see WHETHER a family
 * has paid but never WHAT they were charged.
 *
 * The bug: /api/invoices scoped a school by school_id alone and never looked at
 * `stream`, so a family invoice carrying a school_id came back in full — amounts,
 * line items, and the payer's name and email via the portal_users join.
 */

const familyInvoice = {
  id: 'inv-1',
  invoice_number: 'INV-001',
  stream: 'individual',
  school_id: 'school-1',
  portal_user_id: 'parent-1',
  amount: 50000,
  original_amount: 50000,
  amount_paid: 50000,
  amount_remaining: 0,
  currency: 'NGN',
  items: [{ label: 'Term fee', amount: 50000 }],
  notes: 'paid in full',
  payment_link: 'https://pay/x',
  status: 'paid',
  portal_users: { id: 'parent-1', full_name: 'Caroline Ihueghian', email: 'carol@example.com' },
};

const schoolBill = {
  id: 'inv-2',
  invoice_number: 'INV-002',
  stream: 'school',
  school_id: 'school-1',
  portal_user_id: null,
  amount: 20000,
  amount_paid: 0,
  amount_remaining: 20000,
  status: 'pending',
};

describe('invoice redaction', () => {
  it('a school sees its OWN bill from Rillcod in full', () => {
    const out = redactInvoiceForRole(schoolBill, 'school');
    expect(out?.amount).toBe(20000);
    expect(out?.amounts_hidden).toBeUndefined();
  });

  it('a school never sees what a family was charged', () => {
    const out = redactInvoiceForRole(familyInvoice, 'school')!;
    for (const field of ['amount', 'original_amount', 'amount_paid', 'amount_remaining', 'items', 'invoice_number', 'payment_link', 'notes']) {
      expect(out[field]).toBeUndefined();
    }
  });

  it("a school never sees the family's contact details", () => {
    const out = redactInvoiceForRole(familyInvoice, 'school')!;
    expect(out.portal_users).toBeUndefined();
    expect(JSON.stringify(out)).not.toMatch(/carol@example\.com|Caroline/);
  });
  it("a teacher sees only status even for a school's own bill", () => {
    const out = redactInvoiceForRole(schoolBill, 'teacher')!;
    expect(out.payment_status).toBe('unpaid');
    expect(out.amount).toBeUndefined();
  });


  it('but a school DOES still see the paid indicator', () => {
    const out = redactInvoiceForRole(familyInvoice, 'school')!;
    expect(out.payment_status).toBe('paid');
    expect(out.amounts_hidden).toBe(true);
  });

  it('an unpaid family invoice reads as unpaid, still with no figures', () => {
    const unpaid = { ...familyInvoice, status: 'pending', amount_paid: 0, amount_remaining: 50000 };
    const out = redactInvoiceForRole(unpaid, 'school')!;
    expect(out.payment_status).toBe('unpaid');
    expect(out.amount).toBeUndefined();
  });

  it('part payment is distinguishable without revealing how much', () => {
    const part = { ...familyInvoice, status: 'partially_paid', amount_paid: 20000, amount_remaining: 30000 };
    expect(paymentStatusIndicator(part)).toBe('part_paid');
    const out = redactInvoiceForRole(part, 'school')!;
    expect(out.amount_paid).toBeUndefined();
    expect(out.amount_remaining).toBeUndefined();
  });

  it('admin sees everything', () => {
    expect(redactInvoiceForRole(familyInvoice, 'admin')?.amount).toBe(50000);
  });

  it('a teacher gets the indicator, not the figures', () => {
    const out = redactInvoiceForRole(familyInvoice, 'teacher')!;
    expect(out.payment_status).toBe('paid');
    expect(out.amount).toBeUndefined();
  });

  // REGRESSION GUARD. Redaction is for staff browsing other people's money. Parents
  // and students are already query-scoped to their own records, so redacting them
  // emptied their own payment history — /api/invoices returned nothing at all.
  it('a parent still sees their own family invoice in full', () => {
    const out = redactInvoiceForRole(familyInvoice, 'parent');
    expect(out).not.toBeNull();
    expect(out!.amount).toBe(50000);
    expect(out!.amounts_hidden).toBeUndefined();
  });

  it('a student still sees their own invoice in full', () => {
    expect(redactInvoiceForRole(familyInvoice, 'student')?.amount).toBe(50000);
  });

  it('a parent list is never emptied by redaction', () => {
    expect(redactInvoiceListForRole([familyInvoice], 'parent')).toHaveLength(1);
    expect(redactInvoiceListForRole([familyInvoice], 'student')).toHaveLength(1);
  });

  it('unknown and missing roles still get nothing', () => {
    expect(redactInvoiceForRole(familyInvoice, null)).toBeNull();
    expect(redactInvoiceForRole(familyInvoice, 'stranger')).toBeNull();
  });

  // Rows created before `stream` existed must not default to "family money exposed".
  it('legacy rows are classified by shape when stream is missing', () => {
    expect(isSchoolStreamInvoice({ school_id: 's1', portal_user_id: null })).toBe(true);
    expect(isSchoolStreamInvoice({ school_id: 's1', portal_user_id: 'p1' })).toBe(false);
  });

  it('a legacy family row is still redacted for a school', () => {
    const legacy = { ...familyInvoice, stream: undefined };
    expect(redactInvoiceForRole(legacy, 'school')!.amount).toBeUndefined();
  });

  it('a school never sees what a family actually paid', () => {
    const tx = {
      id: 'tx-1', school_id: 'school-1', portal_user_id: 'parent-1',
      amount: 50000, currency: 'NGN', payment_status: 'completed',
      transaction_reference: 'PSK-123', receipt_url: 'https://r/1',
      portal_users: { full_name: 'Caroline Ihueghian', email: 'carol@example.com' },
    };
    const out = redactTransactionForRole(tx, 'school')!;
    expect(out.amount).toBeUndefined();
    expect(out.receipt_url).toBeUndefined();
    expect(out.transaction_reference).toBeUndefined();
    expect(out.portal_users).toBeUndefined();
    expect(out.payment_status_indicator).toBe('paid');
  });

  it('a school still sees its own settlement transaction in full', () => {
    const tx = { id: 'tx-2', school_id: 'school-1', portal_user_id: null, amount: 20000, payment_status: 'completed' };
    expect(redactTransactionForRole(tx, 'school')?.amount).toBe(20000);
  });
  it('a teacher never sees settlement transaction amounts', () => {
    const tx = { id: 'tx-teacher', school_id: 'school-1', portal_user_id: null, amount: 20000, payment_status: 'completed' };
    const out = redactTransactionForRole(tx, 'teacher')!;
    expect(out.amount).toBeUndefined();
    expect(out.payment_status_indicator).toBe('paid');
  });


  it('a parent still sees their own payment in full', () => {
    const tx = { id: 'tx-3', school_id: 'school-1', portal_user_id: 'parent-1', amount: 50000, payment_status: 'completed' };
    expect(redactTransactionForRole(tx, 'parent')?.amount).toBe(50000);
    expect(redactTransactionListForRole([tx], 'parent')).toHaveLength(1);
  });

  it('a joined invoice overrides the payer column when classifying', () => {
    const tx = {
      id: 'tx-4', school_id: 'school-1', portal_user_id: 'parent-1', amount: 9000,
      payment_status: 'completed', invoices: { stream: 'school', school_id: 'school-1', portal_user_id: null },
    };
    expect(redactTransactionForRole(tx, 'school')?.amount).toBe(9000);
  });

  it('list redaction keeps the school bill whole and strips the family one', () => {
    const out = redactInvoiceListForRole([schoolBill, familyInvoice], 'school');
    expect(out).toHaveLength(2);
    expect(out[0].amount).toBe(20000);
    expect(out[1].amount).toBeUndefined();
    expect(out[1].payment_status).toBe('paid');
  });
});
