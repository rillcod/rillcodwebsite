export const COMPLETED_PAYMENT_STATUSES = new Set(['completed', 'success', 'paid']);

export function isCompletedPaymentStatus(status: unknown): boolean {
  return typeof status === 'string' && COMPLETED_PAYMENT_STATUSES.has(status.toLowerCase());
}

export function normalizePaymentPlan(plan: unknown): 'full' | 'installment' {
  const value = typeof plan === 'string' ? plan.trim().toLowerCase() : '';
  return value === 'installment' || value === 'instalment' ? 'installment' : 'full';
}

export function getSummerProspectStatusForPayment(params: {
  paymentPlan?: unknown;
  balanceDue?: unknown;
}): 'paid' | 'partially_paid' {
  const plan = normalizePaymentPlan(params.paymentPlan);
  if (plan === 'installment') {
    const bal = params.balanceDue !== undefined ? Number(params.balanceDue) : 1;
    return bal > 0 ? 'partially_paid' : 'paid';
  }
  return 'paid';
}

export function studentApprovalPaymentState(student: {
  created_by?: string | null;
  registration_payment_at?: string | null;
  registration_paystack_reference?: string | null;
}): 'staff_registered' | 'paid' | 'awaiting_payment' {
  if (student.created_by) return 'staff_registered';
  if (student.registration_payment_at || student.registration_paystack_reference) return 'paid';
  return 'awaiting_payment';
}
