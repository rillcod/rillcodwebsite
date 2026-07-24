import { describe, expect, it } from 'vitest';
import {
  bankTransferBalanceMessage,
  parseDeclaredTransferAmount,
  resolveBankTransferSettlement,
} from './bank-transfer-amount';

describe('bank transfer amount', () => {
  it('parses declared amounts with commas', () => {
    expect(parseDeclaredTransferAmount('30,000')).toBe(30000);
    expect(parseDeclaredTransferAmount(25000)).toBe(25000);
  });

  it('accepts installment payments above the 50% deposit', () => {
    const result = resolveBankTransferSettlement({
      totalTuition: 50000,
      declaredAmount: 35000,
      selectedPlan: 'installment',
      depositPercent: 50,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settlement.amount).toBe(35000);
    expect(result.settlement.balanceDue).toBe(15000);
    expect(result.settlement.effectivePlan).toBe('installment');
  });

  it('treats full tuition as full payment with zero balance', () => {
    const result = resolveBankTransferSettlement({
      totalTuition: 50000,
      declaredAmount: 50000,
      selectedPlan: 'installment',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settlement.balanceDue).toBe(0);
    expect(result.settlement.effectivePlan).toBe('full');
  });

  it('rejects amounts above tuition', () => {
    const result = resolveBankTransferSettlement({
      totalTuition: 40000,
      declaredAmount: 45000,
      selectedPlan: 'full',
    });
    expect(result.ok).toBe(false);
  });

  it('builds balance copy for parents', () => {
    const settled = resolveBankTransferSettlement({
      totalTuition: 50000,
      declaredAmount: 30000,
      selectedPlan: 'installment',
    });
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    expect(bankTransferBalanceMessage(settled.settlement)).toContain('₦20,000');
  });
});
