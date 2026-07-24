import { normalizePaymentPlan } from '@/lib/registration/payment-state';
import { getSummerBalanceDueFromTotal } from '@/lib/summer-school/pricing';

export const MIN_BANK_TRANSFER_NGN = 1_000;

export type BankTransferSettlement = {
  amount: number;
  totalTuition: number;
  balanceDue: number;
  effectivePlan: 'full' | 'installment';
  suggestedDeposit: number;
  depositPercent: number;
};

export function parseDeclaredTransferAmount(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw);
  const text = String(raw ?? '').replace(/,/g, '').trim();
  if (!text) return null;
  const value = Math.round(Number(text));
  return Number.isFinite(value) ? value : null;
}

/**
 * Resolve how much a parent declared via bank transfer and what balance remains.
 * Accepts any amount from MIN up to full tuition — including more than the
 * standard installment deposit (e.g. 60%, 80%, or 100%).
 */
export function resolveBankTransferSettlement(params: {
  totalTuition: number;
  declaredAmount: unknown;
  selectedPlan?: unknown;
  depositPercent?: number;
}): { ok: true; settlement: BankTransferSettlement } | { ok: false; error: string } {
  const totalTuition = Math.round(Number(params.totalTuition) || 0);
  if (totalTuition <= 0) {
    return { ok: false, error: 'Programme tuition is not configured. Please contact support.' };
  }

  const declaredAmount = parseDeclaredTransferAmount(params.declaredAmount);
  if (declaredAmount == null) {
    return { ok: false, error: 'Enter the amount you transferred (in Naira).' };
  }
  if (declaredAmount < MIN_BANK_TRANSFER_NGN) {
    return { ok: false, error: `Transfer amount must be at least ₦${MIN_BANK_TRANSFER_NGN.toLocaleString()}.` };
  }
  if (declaredAmount > totalTuition) {
    return {
      ok: false,
      error: `Transfer amount cannot exceed total tuition of ₦${totalTuition.toLocaleString()}.`,
    };
  }

  const depositPercent = Number(params.depositPercent) > 0 ? Number(params.depositPercent) : 50;
  const suggestedDeposit = Math.round((totalTuition * depositPercent) / 100);
  const balanceDue = getSummerBalanceDueFromTotal(totalTuition, declaredAmount);
  const effectivePlan = balanceDue <= 0 ? 'full' : normalizePaymentPlan(params.selectedPlan);

  return {
    ok: true,
    settlement: {
      amount: declaredAmount,
      totalTuition,
      balanceDue,
      effectivePlan,
      suggestedDeposit,
      depositPercent,
    },
  };
}

export function formatNairaAmount(amount: number): string {
  return `₦${Math.round(amount).toLocaleString('en-NG')}`;
}

export function bankTransferBalanceMessage(settlement: BankTransferSettlement): string {
  if (settlement.balanceDue <= 0) {
    return `Full tuition of ${formatNairaAmount(settlement.totalTuition)} will be marked once your transfer is verified.`;
  }
  return `After verification, ${formatNairaAmount(settlement.amount)} is credited toward ${formatNairaAmount(settlement.totalTuition)}. Remaining balance: ${formatNairaAmount(settlement.balanceDue)}.`;
}

/** Validate a declared transfer against an outstanding tuition balance (pay-balance flow). */
export function resolveBalanceTransferSettlement(params: {
  outstandingBalance: number;
  totalTuition: number;
  amountPaidSoFar: number;
  declaredAmount: unknown;
}): { ok: true; settlement: BankTransferSettlement } | { ok: false; error: string } {
  const outstandingBalance = Math.round(Number(params.outstandingBalance) || 0);
  const totalTuition = Math.round(Number(params.totalTuition) || 0);
  const amountPaidSoFar = Math.round(Number(params.amountPaidSoFar) || 0);

  if (outstandingBalance <= 0) {
    return { ok: false, error: 'Tuition is already fully paid — thank you!' };
  }

  const declaredAmount = parseDeclaredTransferAmount(params.declaredAmount);
  if (declaredAmount == null) {
    return { ok: false, error: 'Enter the amount you transferred (in Naira).' };
  }
  if (declaredAmount < MIN_BANK_TRANSFER_NGN) {
    return { ok: false, error: `Transfer amount must be at least ₦${MIN_BANK_TRANSFER_NGN.toLocaleString()}.` };
  }
  if (declaredAmount > outstandingBalance) {
    return {
      ok: false,
      error: `Transfer amount cannot exceed the outstanding balance of ₦${outstandingBalance.toLocaleString()}.`,
    };
  }

  const balanceDue = Math.max(0, outstandingBalance - declaredAmount);

  return {
    ok: true,
    settlement: {
      amount: declaredAmount,
      totalTuition,
      balanceDue: amountPaidSoFar + declaredAmount >= totalTuition ? 0 : balanceDue,
      effectivePlan: balanceDue <= 0 ? 'full' : 'installment',
      suggestedDeposit: outstandingBalance,
      depositPercent: 100,
    },
  };
}
