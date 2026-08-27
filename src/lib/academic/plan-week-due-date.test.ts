import { describe, expect, it } from 'vitest';
import { dueDateForPlanWeek } from './plan-week-due-date';

describe('dueDateForPlanWeek', () => {
  it('anchors homework to term start + week cadence', () => {
    const due = dueDateForPlanWeek('2026-01-05T12:00:00', 2);
    expect(due.getDate()).toBe(19);
    expect(due.getMonth()).toBe(0);
    expect(due.getFullYear()).toBe(2026);
    expect(due.getHours()).toBe(18);
  });

  it('gives projects one extra week after the homework deadline', () => {
    const homework = dueDateForPlanWeek('2026-01-05T12:00:00', 1);
    const project = dueDateForPlanWeek('2026-01-05T12:00:00', 1, {
      extraDays: 7,
    });
    expect(project.getTime() - homework.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
