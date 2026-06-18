import { describe, expect, it } from 'vitest';
import {
  getSummerProspectStatusForPayment,
  isCompletedPaymentStatus,
  normalizePaymentPlan,
  studentApprovalPaymentState,
} from './payment-state';

describe('registration payment state helpers', () => {
  it('normalizes installment spelling variants', () => {
    expect(normalizePaymentPlan('installment')).toBe('installment');
    expect(normalizePaymentPlan('instalment')).toBe('installment');
    expect(normalizePaymentPlan('full')).toBe('full');
    expect(normalizePaymentPlan(undefined)).toBe('full');
  });

  it('keeps Summer School deposits partially paid until balance is settled', () => {
    expect(getSummerProspectStatusForPayment({ paymentPlan: 'installment', balanceDue: 30000 })).toBe('partially_paid');
    expect(getSummerProspectStatusForPayment({ paymentPlan: 'instalment', balanceDue: 30000 })).toBe('partially_paid');
    expect(getSummerProspectStatusForPayment({ paymentPlan: 'installment', balanceDue: 0 })).toBe('paid');
    expect(getSummerProspectStatusForPayment({ paymentPlan: 'full', balanceDue: 0 })).toBe('paid');
  });

  it('detects completed transaction status aliases', () => {
    expect(isCompletedPaymentStatus('completed')).toBe(true);
    expect(isCompletedPaymentStatus('success')).toBe(true);
    expect(isCompletedPaymentStatus('paid')).toBe(true);
    expect(isCompletedPaymentStatus('pending')).toBe(false);
  });

  it('requires payment only for public student registrations', () => {
    expect(studentApprovalPaymentState({ created_by: 'staff-id' })).toBe('staff_registered');
    expect(studentApprovalPaymentState({ registration_payment_at: '2026-06-18T00:00:00Z' })).toBe('paid');
    expect(studentApprovalPaymentState({ registration_paystack_reference: 'REG-123' })).toBe('paid');
    expect(studentApprovalPaymentState({})).toBe('awaiting_payment');
  });
});
