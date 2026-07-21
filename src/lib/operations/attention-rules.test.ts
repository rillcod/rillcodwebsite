import { describe, expect, it } from 'vitest';
import { evaluateCaseAttention, UNASSIGNED_ATTENTION_HOURS } from './attention-rules';

describe('evaluateCaseAttention', () => {
  const now = new Date('2026-07-21T12:00:00Z').getTime();

  it('ignores ordinary open work that is recently assigned', () => {
    const result = evaluateCaseAttention(
      {
        status: 'open',
        priority: 'normal',
        assigned_to: 'staff-1',
        updated_at: '2026-07-21T10:00:00Z',
      },
      now,
    );
    expect(result.needsAttention).toBe(false);
  });

  it('flags urgent and restricted cases', () => {
    expect(
      evaluateCaseAttention({ status: 'open', priority: 'urgent', assigned_to: 'staff-1' }, now).needsAttention,
    ).toBe(true);
    expect(
      evaluateCaseAttention({ status: 'open', restricted: true, assigned_to: 'staff-1' }, now).needsAttention,
    ).toBe(true);
  });

  it('flags unassigned cases beyond the threshold', () => {
    const hoursAgo = UNASSIGNED_ATTENTION_HOURS + 1;
    const created = new Date(now - hoursAgo * 60 * 60 * 1000).toISOString();
    const result = evaluateCaseAttention(
      { status: 'open', priority: 'normal', created_at: created },
      now,
    );
    expect(result.needsAttention).toBe(true);
    expect(result.reason).toMatch(/Unassigned/i);
  });

  it('flags reopened cases', () => {
    expect(evaluateCaseAttention({ status: 'reopened', assigned_to: 'staff-1' }, now).needsAttention).toBe(true);
  });
});
