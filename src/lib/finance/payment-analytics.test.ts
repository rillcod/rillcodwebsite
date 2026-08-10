import { describe, expect, it } from 'vitest';
import { summarizePaymentTransactions } from './payment-analytics';

describe('summarizePaymentTransactions', () => {
  it('keeps currencies separate and subtracts refunds from net revenue', () => {
    const result = summarizePaymentTransactions([
      { amount: 10_000, currency: 'ngn', payment_status: 'completed', course_id: 'course-a' },
      { amount: 2_500, currency: 'NGN', payment_status: 'refunded', course_id: 'course-a' },
      { amount: 50, currency: 'USD', payment_status: 'paid', course_id: 'course-b' },
    ]);

    expect(result.totalRevenue).toBe(7_500);
    expect(result.netRevenueByCurrency).toEqual({ NGN: 7_500, USD: 50 });
    expect(result.revenueByCourse).toEqual({
      'course-a': { NGN: 10_000 },
      'course-b': { USD: 50 },
    });
  });

  it('calculates success rate only from completed and failed attempts', () => {
    const result = summarizePaymentTransactions([
      { amount: 1, currency: 'NGN', payment_status: 'success', course_id: null },
      { amount: 1, currency: 'NGN', payment_status: 'failed', course_id: null },
      { amount: 1, currency: 'NGN', payment_status: 'pending', course_id: null },
      { amount: 1, currency: 'NGN', payment_status: 'processing', course_id: null },
    ]);

    expect(result.successRate).toBe(50);
    expect(result.metrics).toEqual({
      successCount: 1,
      failureCount: 1,
      pendingCount: 2,
      refundedCount: 0,
    });
  });
});
