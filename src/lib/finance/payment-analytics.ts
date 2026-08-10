export type PaymentAnalyticsRow = {
  amount: number | string | null;
  currency: string | null;
  payment_status: string | null;
  course_id: string | null;
};

export type PaymentAnalytics = {
  totalRevenue: number;
  grossRevenue: number;
  refundedAmount: number;
  netRevenueByCurrency: Record<string, number>;
  grossRevenueByCurrency: Record<string, number>;
  refundedByCurrency: Record<string, number>;
  successRate: number;
  metrics: {
    successCount: number;
    failureCount: number;
    pendingCount: number;
    refundedCount: number;
  };
  revenueByCourse: Record<string, Record<string, number>>;
};

export function summarizePaymentTransactions(rows: PaymentAnalyticsRow[]): PaymentAnalytics {
  let successCount = 0;
  let failureCount = 0;
  let pendingCount = 0;
  let refundedCount = 0;
  const grossByCurrency: Record<string, number> = {};
  const refundedByCurrency: Record<string, number> = {};
  const revenueByCourse: Record<string, Record<string, number>> = {};

  for (const transaction of rows) {
    const status = String(transaction.payment_status || '').toLowerCase();
    const currency = String(transaction.currency || 'NGN').toUpperCase();
    const amount = Number(transaction.amount) || 0;

    if (['completed', 'success', 'paid'].includes(status)) {
      successCount += 1;
      grossByCurrency[currency] = (grossByCurrency[currency] || 0) + amount;
      if (transaction.course_id) {
        revenueByCourse[transaction.course_id] ||= {};
        revenueByCourse[transaction.course_id][currency] =
          (revenueByCourse[transaction.course_id][currency] || 0) + amount;
      }
    } else if (status === 'refunded') {
      refundedCount += 1;
      refundedByCurrency[currency] = (refundedByCurrency[currency] || 0) + amount;
    } else if (status === 'failed') {
      failureCount += 1;
    } else if (['pending', 'processing', 'submitted'].includes(status)) {
      pendingCount += 1;
    }
  }

  const netByCurrency: Record<string, number> = {};
  for (const currency of new Set([...Object.keys(grossByCurrency), ...Object.keys(refundedByCurrency)])) {
    netByCurrency[currency] = (grossByCurrency[currency] || 0) - (refundedByCurrency[currency] || 0);
  }

  const completedAttempts = successCount + failureCount;
  const successRate = completedAttempts > 0 ? (successCount / completedAttempts) * 100 : 0;

  return {
    totalRevenue: netByCurrency.NGN || 0,
    grossRevenue: grossByCurrency.NGN || 0,
    refundedAmount: refundedByCurrency.NGN || 0,
    netRevenueByCurrency: netByCurrency,
    grossRevenueByCurrency: grossByCurrency,
    refundedByCurrency,
    successRate: Math.round(successRate * 100) / 100,
    metrics: { successCount, failureCount, pendingCount, refundedCount },
    revenueByCourse,
  };
}
