import { describe, expect, it } from 'vitest';
import {
  assetMeetingSession,
  meetingLookupKey,
  normalizeMeetingSession,
  parseRequestSession,
  planMeetingLookupKey,
  planRowMeetingSession,
} from './session-identity';
import {
  allowLiveTermFallback,
  evidenceBelongsToSchoolTerm,
} from './teaching-period';
import { specialPrepBlockers } from './prepare-teaching';
import { buildTeachingReadiness } from '@/lib/special-programs/teaching-readiness';
import { pendingWeekKey } from './pending-approval';

describe('session-identity', () => {
  it('reads session from metadata, fields, then title', () => {
    expect(assetMeetingSession({ metadata: { session: 2 }, title: 'Session 9' })).toBe(2);
    expect(assetMeetingSession({ session: 3 })).toBe(3);
    expect(assetMeetingSession({ title: 'Week 1 · Session 4: Cards' })).toBe(4);
    expect(assetMeetingSession({ title: 'Week 1 homework' })).toBe(0);
  });

  it('parses request bodies consistently', () => {
    expect(parseRequestSession({ session: 2 })).toBe(2);
    expect(parseRequestSession({ only_session: 3 })).toBe(3);
    expect(parseRequestSession({ session_number: '4' })).toBe(4);
    expect(parseRequestSession({})).toBeNull();
    expect(normalizeMeetingSession(0)).toBeNull();
  });

  it('builds lookup keys for school and special meetings', () => {
    expect(meetingLookupKey(1, null)).toBe('1');
    expect(meetingLookupKey(1, 2)).toBe('1:s2');
    expect(planMeetingLookupKey(1, null)).toBe('1:s1');
    expect(planRowMeetingSession({ session: 2 })).toBe(2);
    expect(planRowMeetingSession({})).toBe(0);
  });
});

describe('teaching-period evidence scope', () => {
  const range = {
    academicTermId: 'term-1',
    startDate: '2026-01-01',
    endDate: '2026-03-31',
  };

  it('keeps school submissions by term or date window', () => {
    expect(
      evidenceBelongsToSchoolTerm(
        { assignments: { term_id: 'term-1' }, graded_at: '2026-02-01T00:00:00Z' },
        range,
      ),
    ).toBe(true);
    expect(
      evidenceBelongsToSchoolTerm(
        { graded_at: '2026-02-01T00:00:00Z' },
        range,
      ),
    ).toBe(true);
  });

  it('excludes duration offering work from school term date windows', () => {
    expect(
      evidenceBelongsToSchoolTerm(
        {
          assignments: { academic_offering_id: 'off-1', term_id: null },
          graded_at: '2026-02-01T00:00:00Z',
        },
        range,
      ),
    ).toBe(false);
    expect(
      evidenceBelongsToSchoolTerm(
        {
          academic_offering_id: 'off-1',
          term_id: null,
          created_at: '2026-02-01T00:00:00Z',
        },
        range,
      ),
    ).toBe(false);
  });

  it('blocks live-term fallback for offering-backed work', () => {
    expect(allowLiveTermFallback({ academic_offering_id: 'off-1' })).toBe(false);
    expect(allowLiveTermFallback({ academic_model: 'duration_programme' })).toBe(false);
    expect(allowLiveTermFallback({ academic_model: 'termly_school' })).toBe(true);
  });
});

describe('prepare-teaching gate', () => {
  it('uses the same blockers as readiness can_prepare', () => {
    const blocked = buildTeachingReadiness({
      programId: null,
      schoolId: 's1',
      isPublished: true,
    });
    expect(specialPrepBlockers(blocked)).toContain('Programme linked');
    expect(blocked.can_prepare).toBe(false);

    const ready = buildTeachingReadiness({
      programId: 'p1',
      schoolId: 's1',
      isPublished: true,
    });
    expect(specialPrepBlockers(ready)).toEqual([]);
    expect(ready.can_prepare).toBe(true);
  });
});

describe('pendingWeekKey', () => {
  it('includes session when present', () => {
    expect(pendingWeekKey({ planId: 'p', week: 1, session: 2 })).toBe('p:1:s2');
    expect(pendingWeekKey({ planId: 'p', week: 1 })).toBe('p:1');
  });
});
