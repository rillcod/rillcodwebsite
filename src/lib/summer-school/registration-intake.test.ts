import { describe, expect, it } from 'vitest';
import {
  classifyRegistrationDuplicate,
  filterSameProgramRegistrations,
  mergeProspectRegistrationRows,
  resolveProgramTuitionContext,
  resolveRegistrationCharge,
} from './registration-intake';

describe('registration intake', () => {
  it('merges duplicate prospect rows by id', () => {
    const merged = mergeProspectRegistrationRows(
      [{ id: 'a', status: 'unpaid', created_at: '2026-01-02' }],
      [{ id: 'a', status: 'unpaid', created_at: '2026-01-01' }, { id: 'b', status: 'paid', created_at: '2026-01-03' }],
    );
    expect(merged.map((row) => row.id)).toEqual(['b', 'a']);
  });

  it('scopes registrations to the same special page', () => {
    const rows = filterSameProgramRegistrations(
      [
        { id: '1', status: 'unpaid', created_at: '1', notes: '[SpecialPage: page-1]' },
        { id: '2', status: 'unpaid', created_at: '1', notes: '[SpecialPage: other]' },
      ],
      { id: 'page-1', title: 'Holiday Camp' },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('1');
  });

  it('classifies partially paid as balance block', () => {
    const decision = classifyRegistrationDuplicate([
      { id: 'x', status: 'partially_paid', created_at: '1' },
    ], null, 'Ada');
    expect(decision.kind).toBe('block_balance');
  });

  it('resolves bank transfer charge above deposit', () => {
    const tuition = resolveProgramTuitionContext(
      { online_fee: 50000, onsite_fee: 40000, deposit_percent: 50 },
      'Online',
      'installment',
    );
    const charge = resolveRegistrationCharge({
      paymentMethod: 'bank_transfer',
      paymentPlan: 'installment',
      tuition,
      transferAmount: 35000,
    });
    expect(charge.ok).toBe(true);
    if (!charge.ok) return;
    expect(charge.charge.chargeAmount).toBe(35000);
    expect(charge.charge.balanceDue).toBe(15000);
  });
});
