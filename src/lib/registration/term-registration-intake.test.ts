import { describe, expect, it } from 'vitest';
import {
  resolveTermRegistrationCharge,
  resolveTermBalancePaymentCharge,
  normalizeTermPaymentPlan,
} from '@/lib/registration/term-registration-intake';

describe('term-registration-intake', () => {
  it('resolves paystack full charge', () => {
    const r = resolveTermRegistrationCharge({
      paymentMethod: 'paystack',
      paymentPlan: 'full',
      totalTuition: 50000,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.charge.chargeAmount).toBe(50000);
      expect(r.charge.balanceDue).toBe(0);
    }
  });

  it('resolves bank transfer instalment deposit', () => {
    const r = resolveTermRegistrationCharge({
      paymentMethod: 'bank_transfer',
      paymentPlan: 'instalment',
      totalTuition: 50000,
      transferAmount: 25000,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.charge.chargeAmount).toBe(25000);
      expect(r.charge.balanceDue).toBe(25000);
    }
  });

  it('resolves term balance bank transfer', () => {
    const r = resolveTermBalancePaymentCharge({
      paymentMethod: 'bank_transfer',
      outstandingBalance: 20000,
      totalTuition: 50000,
      amountPaidSoFar: 30000,
      transferAmount: 15000,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.charge.chargeAmount).toBe(15000);
      expect(r.charge.balanceDue).toBe(5000);
    }
  });

  it('normalizes payment plan aliases', () => {
    expect(normalizeTermPaymentPlan('installment')).toBe('instalment');
    expect(normalizeTermPaymentPlan('full')).toBe('full');
  });
});
