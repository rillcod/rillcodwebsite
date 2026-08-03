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

  /**
   * The stride between terms used to be 12, so calendar weeks past the twelfth
   * clamped onto it. A Nigerian term commonly runs to 13, which meant weeks 12
   * and 13 both resolved to the same curriculum week: a class taught two
   * different weeks and the second overwrote the first's position.
   */
  it('keeps late weeks of a long term distinct', () => {
    const schedule = { entryTerm: 1, entryWeek: 1 };
    const twelfth = mapCalendarToCurriculumPosition({
      calendarTerm: 1,
      calendarWeek: 12,
      schedule,
    });
    const thirteenth = mapCalendarToCurriculumPosition({
      calendarTerm: 1,
      calendarWeek: 13,
      schedule,
    });
    expect(twelfth).toMatchObject({ year: 1, term: 1, week: 12 });
    expect(thirteenth).toMatchObject({ year: 1, term: 1, week: 13 });
    expect(thirteenth!.absoluteWeek).not.toBe(twelfth!.absoluteWeek);
  });

  it('still starts the next term at week 1 when a term runs long', () => {
    // Terms advance by term, not by accumulated weeks, so a 13-week term must
    // not push the following term's first week off 1.
    expect(
      mapCalendarToCurriculumPosition({
        calendarTerm: 2,
        calendarWeek: 1,
        schedule: { entryTerm: 1, entryWeek: 1 },
      })
    ).toMatchObject({ year: 1, term: 2, week: 1 });
  });

  it('prefers a class override over the school default', () => {
    const schoolDefault = { entryTerm: 1, entryWeek: 1 };
    const classOverride = { entryTerm: 3, entryWeek: 3 };
    expect(effectiveDeliverySchedule({ schoolDefault, classOverride })).toBe(classOverride);
  });
});
