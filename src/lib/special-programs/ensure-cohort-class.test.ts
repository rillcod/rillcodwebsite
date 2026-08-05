import { describe, expect, it } from 'vitest';
import { pickPrimaryCohort, toCohortSummary } from './ensure-cohort-class';
import { buildTeachingReadiness } from './teaching-readiness';

describe('pickPrimaryCohort', () => {
  it('prefers an active class over a newer completed one', () => {
    const primary = pickPrimaryCohort([
      toCohortSummary(
        { id: 'new', name: 'Done', status: 'completed', teacher_id: null },
        null,
      ),
      toCohortSummary(
        { id: 'live', name: 'Summer School 2026', status: 'active', teacher_id: 't1' },
        'Ada',
      ),
    ]);
    expect(primary?.id).toBe('live');
    expect(primary?.teacher_name).toBe('Ada');
  });

  it('falls back to the first class when none are active', () => {
    const primary = pickPrimaryCohort([
      toCohortSummary({ id: 'a', name: 'Old', status: 'completed', teacher_id: null }, null),
    ]);
    expect(primary?.id).toBe('a');
    expect(
      buildTeachingReadiness({
        programId: 'p',
        schoolId: 's',
        isPublished: true,
        startsOn: '2026-07-01',
        cohortClass: primary,
      }).ready,
    ).toBe(false);
  });
});
