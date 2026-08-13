import { describe, expect, it } from 'vitest';
import {
  FINANCE_REMINDER_RETRY_COOLDOWN_MS,
  financeReminderRetryState,
} from './retry-policy';

describe('finance reminder retry policy', () => {
  const now = Date.parse('2026-08-13T12:00:00.000Z');

  it('temporarily pauses three rapid failures', () => {
    const state = financeReminderRetryState([
      { attempt: 3, created_at: new Date(now - 60_000).toISOString() },
      { attempt: 2, created_at: new Date(now - 120_000).toISOString() },
      { attempt: 1, created_at: new Date(now - 180_000).toISOString() },
    ], now);
    expect(state).toEqual({ attempt: 4, cooldownActive: true });
  });

  it('automatically unlocks after the cooldown', () => {
    const state = financeReminderRetryState([
      { attempt: 3, created_at: new Date(now - FINANCE_REMINDER_RETRY_COOLDOWN_MS - 1).toISOString() },
      { attempt: 2 },
      { attempt: 1 },
    ], now);
    expect(state).toEqual({ attempt: 4, cooldownActive: false });
  });
});

