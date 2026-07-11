import { describe, expect, it } from 'vitest';
import { canTransitionSettlement, validateSettlementAmount } from './settlement-state';

describe('settlement state', () => {
  it('allows operational forward transitions', () => {
    expect(canTransitionSettlement('pending', 'processing')).toBe(true);
    expect(canTransitionSettlement('processing', 'paid')).toBe(true);
  });
  it('does not reopen void settlements', () => {
    expect(canTransitionSettlement('void', 'pending')).toBe(false);
  });
  it('validates positive amounts', () => {
    expect(validateSettlementAmount('1250')).toBe(1250);
    expect(validateSettlementAmount(0)).toBeNull();
  });
});