import { describe, expect, it } from 'vitest';
import { buildTeachingReadiness } from './teaching-readiness';

describe('buildTeachingReadiness', () => {
  it('requires programme, school, cohort, dates, and publish for ready', () => {
    const r = buildTeachingReadiness({
      programId: 'p1',
      schoolId: 's1',
      isPublished: true,
      startsOn: '2026-07-01',
      cohortClass: {
        id: 'c1',
        name: 'Summer School 2026',
        status: 'active',
        teacher_id: 't1',
        teacher_name: 'Ada',
      },
    });
    expect(r.ready).toBe(true);
    expect(r.can_prepare).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('still prepares without a cohort — the launch creates one automatically', () => {
    const withoutCohort = buildTeachingReadiness({
      programId: 'p1',
      schoolId: 's1',
      isPublished: true,
      startsOn: null,
      cohortClass: null,
    });
    expect(withoutCohort.can_prepare).toBe(true);
    expect(withoutCohort.ready).toBe(false);
    expect(withoutCohort.missing).toContain('Cohort class ready');
    expect(withoutCohort.missing).toContain('Start date set');
  });

  it('blocks prepare when school is missing', () => {
    expect(
      buildTeachingReadiness({
        programId: 'p1',
        schoolId: null,
        isPublished: true,
      }).can_prepare,
    ).toBe(false);
  });

  it('blocks prepare while the page is unpublished', () => {
    expect(
      buildTeachingReadiness({
        programId: 'p1',
        schoolId: 's1',
        isPublished: false,
      }).can_prepare,
    ).toBe(false);
  });

  it('blocks prepare when programme missing', () => {
    const r = buildTeachingReadiness({
      programId: null,
      schoolId: 's1',
      isPublished: true,
    });
    expect(r.can_prepare).toBe(false);
  });
});
