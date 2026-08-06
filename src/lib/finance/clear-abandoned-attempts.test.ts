import { describe, expect, it } from 'vitest';
import { DEFAULT_GRACE_DAYS, planClear } from './clear-abandoned-attempts';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

const attempt = (over: Record<string, unknown> = {}) => ({
  id: 'tx-1',
  amount: 50000,
  currency: 'NGN',
  created_at: daysAgo(30),
  invoice_id: null,
  payment_status: 'failed',
  payment_gateway_response: { student_name: 'Ada', prospect_id: 'p1' },
  ...over,
} as never);

const noneHavePaid = new Set<string>();

describe('what may be cleared', () => {
  it('clears an old, unfinished, unbilled attempt', () => {
    const plan = planClear([attempt()], { prospectsWithCompletedPayments: noneHavePaid });
    expect(plan.clearable.map((a) => a.id)).toEqual(['tx-1']);
    expect(plan.kept).toEqual([]);
  });

  it('carries the payer through so the operator sees a person, not an id', () => {
    const plan = planClear([attempt()], { prospectsWithCompletedPayments: noneHavePaid });
    expect(plan.clearable[0].payer).toBe('Ada');
    expect(plan.clearable[0].amount).toBe(50000);
  });

  it('falls back to the parent email when there is no student name', () => {
    const plan = planClear(
      [attempt({ payment_gateway_response: { parent_email: 'a@b.com' } })],
      { prospectsWithCompletedPayments: noneHavePaid },
    );
    expect(plan.clearable[0].payer).toBe('a@b.com');
  });
});

describe('what must never be cleared', () => {
  it('refuses anything that is not a failed attempt', () => {
    for (const status of ['completed', 'pending', 'processing']) {
      const plan = planClear([attempt({ payment_status: status })], { prospectsWithCompletedPayments: noneHavePaid });
      expect(plan.clearable).toEqual([]);
      expect(plan.kept[0].reason).toContain(status);
    }
  });

  it('refuses a superseded or voided attempt — the stamp is the audit trail', () => {
    const superseded = planClear(
      [attempt({ payment_gateway_response: { student_name: 'Ada', superseded_at: daysAgo(1) } })],
      { prospectsWithCompletedPayments: noneHavePaid },
    );
    expect(superseded.clearable).toEqual([]);
    expect(superseded.kept[0].reason).toContain('superseded');

    const voided = planClear(
      [attempt({ payment_gateway_response: { student_name: 'Ada', reconciliation_voided: true } })],
      { prospectsWithCompletedPayments: noneHavePaid },
    );
    expect(voided.clearable).toEqual([]);
    expect(voided.kept[0].reason).toContain('voided');
  });

  it('refuses an attempt attached to an invoice', () => {
    const plan = planClear([attempt({ invoice_id: 'inv-1' })], { prospectsWithCompletedPayments: noneHavePaid });
    expect(plan.clearable).toEqual([]);
    expect(plan.kept[0].reason).toContain('invoice');
  });

  it('refuses an attempt from a payer who did eventually pay', () => {
    // Their abandoned attempt is part of how their payment history reads.
    const plan = planClear([attempt()], { prospectsWithCompletedPayments: new Set(['p1']) });
    expect(plan.clearable).toEqual([]);
    expect(plan.kept[0].reason).toContain('completed a payment');
  });

  it('refuses an attempt inside the grace period — they may still be paying', () => {
    const plan = planClear([attempt({ created_at: daysAgo(1) })], { prospectsWithCompletedPayments: noneHavePaid });
    expect(plan.clearable).toEqual([]);
    expect(plan.kept[0].reason).toMatch(/still be paying/);
  });

  it('uses a 7 day grace by default and honours an override', () => {
    expect(DEFAULT_GRACE_DAYS).toBe(7);
    const row = [attempt({ created_at: daysAgo(10) })];
    expect(planClear(row, { prospectsWithCompletedPayments: noneHavePaid }).clearable).toHaveLength(1);
    expect(planClear(row, { graceDays: 30, prospectsWithCompletedPayments: noneHavePaid }).clearable).toHaveLength(0);
  });

  it('protects a paying payer even in a mixed batch', () => {
    const plan = planClear(
      [
        attempt({ id: 'keep', payment_gateway_response: { student_name: 'Paid Kid', prospect_id: 'p-paid' } }),
        attempt({ id: 'clear', payment_gateway_response: { student_name: 'Gone', prospect_id: 'p-gone' } }),
      ],
      { prospectsWithCompletedPayments: new Set(['p-paid']) },
    );
    expect(plan.clearable.map((a) => a.id)).toEqual(['clear']);
    expect(plan.kept.map((k) => k.id)).toEqual(['keep']);
  });
});
