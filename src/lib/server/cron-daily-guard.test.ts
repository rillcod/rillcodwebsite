import { describe, expect, it } from 'vitest';
import { claimDailyGuard, todayUtcDate } from './cron-daily-guard';

function mockDb(store: Record<string, string> = {}) {
  return {
    from: () => ({
      select: () => ({
        eq: (_col: string, key: string) => ({
          maybeSingle: async () => ({ data: store[key] ? { value: store[key] } : null, error: null }),
        }),
      }),
      upsert: async (row: { key: string; value: string }) => {
        store[row.key] = row.value;
        return { error: null };
      },
    }),
  };
}

describe('cron daily guard', () => {
  it('claims the day once', async () => {
    const db = mockDb();
    const first = await claimDailyGuard(db as any, 'test_guard');
    expect(first?.today).toBe(todayUtcDate());
    const second = await claimDailyGuard(db as any, 'test_guard');
    expect(second).toBeNull();
  });

  it('releases the guard for retry', async () => {
    const db = mockDb();
    const claim = await claimDailyGuard(db as any, 'retry_guard');
    expect(claim).not.toBeNull();
    await claim!.release('test failure');
    const again = await claimDailyGuard(db as any, 'retry_guard');
    expect(again?.today).toBe(todayUtcDate());
  });
});
