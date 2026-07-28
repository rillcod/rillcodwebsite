import { describe, expect, it } from 'vitest';
import {
  effectiveDeliverySchedule,
  mapCalendarToCurriculumPosition,
} from './deliverySchedule';

describe('dynamic curriculum delivery schedules', () => {
  it('maps a Term 3 entry to curriculum Term 1', () => {
    expect(mapCalendarToCurriculumPosition({
      calendarTerm: 3,
      calendarWeek: 1,
      schedule: { entryTerm: 3, entryWeek: 1 },
    })).toMatchObject({ year: 1, term: 1, week: 1 });
  });

  it('supports a school whose first teaching week is Term 3 Week 3', () => {
    const schedule = { entryTerm: 3, entryWeek: 3 };
    expect(mapCalendarToCurriculumPosition({ calendarTerm: 3, calendarWeek: 2, schedule })).toBeNull();
    expect(mapCalendarToCurriculumPosition({ calendarTerm: 3, calendarWeek: 3, schedule }))
      .toMatchObject({ year: 1, term: 1, week: 1 });
    expect(mapCalendarToCurriculumPosition({ calendarTerm: 3, calendarWeek: 6, schedule }))
      .toMatchObject({ year: 1, term: 1, week: 4 });
  });

  it('continues across the national academic-year boundary', () => {
    expect(mapCalendarToCurriculumPosition({
      calendarTerm: 1,
      calendarWeek: 1,
      schedule: { entryTerm: 3, entryWeek: 1 },
    })).toMatchObject({ year: 1, term: 2, week: 1 });
  });

  it('prefers a class override over the school default', () => {
    const schoolDefault = { entryTerm: 1, entryWeek: 1 };
    const classOverride = { entryTerm: 3, entryWeek: 3 };
    expect(effectiveDeliverySchedule({ schoolDefault, classOverride })).toBe(classOverride);
  });
});
