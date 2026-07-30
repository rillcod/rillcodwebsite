import { describe, expect, it } from 'vitest';
import { scheduledWeekForDate } from '@/app/api/cron/term-scheduler/schedule';

describe('term scheduler timing', () => {
  it('waits until the school or programme start date', () => {
    expect(scheduledWeekForDate('2026-09-14', 7, new Date('2026-09-13T23:59:59Z'))).toBe(0);
    expect(scheduledWeekForDate('2026-09-14', 7, new Date('2026-09-14T12:00:00Z'))).toBe(1);
  });

  it('uses each schedule cadence rather than a platform-wide week', () => {
    expect(scheduledWeekForDate('2026-09-01', 7, new Date('2026-09-08T12:00:00Z'))).toBe(2);
    expect(scheduledWeekForDate('2026-09-01', 14, new Date('2026-09-08T12:00:00Z'))).toBe(1);
  });

  it('supports a pathway entering later in the academic year', () => {
    expect(scheduledWeekForDate('2027-04-19', 7, new Date('2027-05-03T09:00:00Z'))).toBe(3);
  });
});
