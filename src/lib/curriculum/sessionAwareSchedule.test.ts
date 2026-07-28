import { describe, expect, it } from 'vitest';
import { academicSessionDistance, mapSessionCalendarToCurriculumPosition } from './sessionAwareSchedule';

describe('session-aware curriculum timing', () => {
  it('calculates academic session distance from human session labels', () => {
    expect(academicSessionDistance('2026/2027', '2028/2029')).toBe(2);
  });

  it('does not activate a future Third Term entry during First Term of the same session', () => {
    expect(mapSessionCalendarToCurriculumPosition({
      entryAcademicSession: '2025/2026', currentAcademicSession: '2025/2026',
      calendarTerm: 1, calendarWeek: 1,
      schedule: { entryTerm: 3, entryWeek: 3 },
    })).toBeNull();
  });

  it('maps Third Term Week 3 to Programme Year 1 First Term Week 1', () => {
    expect(mapSessionCalendarToCurriculumPosition({
      entryAcademicSession: '2025/2026', currentAcademicSession: '2025/2026',
      calendarTerm: 3, calendarWeek: 3,
      schedule: { entryTerm: 3, entryWeek: 3 },
    })).toMatchObject({ year: 1, term: 1, week: 1 });
  });

  it('makes the next school term Programme Year 1 Second Term', () => {
    expect(mapSessionCalendarToCurriculumPosition({
      entryAcademicSession: '2025/2026', currentAcademicSession: '2026/2027',
      calendarTerm: 1, calendarWeek: 1,
      schedule: { entryTerm: 3, entryWeek: 3 },
    })).toMatchObject({ year: 1, term: 2, week: 1 });
  });

  it('advances to Programme Year 2 after three school-term transitions', () => {
    expect(mapSessionCalendarToCurriculumPosition({
      entryAcademicSession: '2025/2026', currentAcademicSession: '2026/2027',
      calendarTerm: 3, calendarWeek: 1,
      schedule: { entryTerm: 3, entryWeek: 1 },
    })).toMatchObject({ year: 2, term: 1, week: 1 });
  });
});
