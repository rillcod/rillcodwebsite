import { describe, expect, it } from 'vitest';
import {
  assetMeetingSession,
  assetStampedMeetingSession,
  meetingLookupKey,
  normalizeMeetingSession,
  parseRequestSession,
  planMeetingLookupKey,
  planRowMeetingSession,
  teachingMeetingLabel,
  teachingMeetingShortLabel,
} from './session-identity';
import {
  allowLiveTermFallback,
  evidenceBelongsToSchoolTerm,
} from './teaching-period';
import { specialPrepBlockers } from './prepare-teaching';
import { buildTeachingReadiness } from '@/lib/special-programs/teaching-readiness';
import { pendingWeekKey } from './pending-approval';

describe('session-identity', () => {
  it('reads session_number, then fields, then metadata — never titles', () => {
    expect(assetMeetingSession({ session_number: 2, title: 'Session 9' })).toBe(2);
    expect(assetMeetingSession({ session: 3 })).toBe(3);
    expect(assetMeetingSession({ metadata: { session: 2 }, title: 'Session 9' })).toBe(2);
    expect(assetMeetingSession({ title: 'Week 1 · Session 4: Cards' })).toBe(1);
    expect(assetMeetingSession({ title: 'Week 1 homework' })).toBe(1);
    expect(assetStampedMeetingSession({ title: 'Week 1 · Session 4: Cards' })).toBe(1);
  });

  it('parses request bodies consistently', () => {
    expect(parseRequestSession({ session: 2 })).toBe(2);
    expect(parseRequestSession({ only_session: 3 })).toBe(3);
    expect(parseRequestSession({ session_number: '4' })).toBe(4);
    expect(parseRequestSession({})).toBeNull();
    expect(normalizeMeetingSession(0)).toBeNull();
  });

  it('builds lookup keys as week:sN for every pathway', () => {
    expect(meetingLookupKey(1, null)).toBe('1:s1');
    expect(meetingLookupKey(1, 2)).toBe('1:s2');
    expect(planMeetingLookupKey(1, null)).toBe('1:s1');
    expect(planRowMeetingSession({ session: 2 })).toBe(2);
    expect(planRowMeetingSession({})).toBe(1);
  });

  it('labels a physical school week as Week N, and only shows Class when the week meets more than once', () => {
    expect(teachingMeetingLabel(3)).toBe('Week 3');
    expect(teachingMeetingLabel(3, 1)).toBe('Week 3');
    expect(teachingMeetingLabel(3, 1, 2)).toBe('Week 3 · Class 1');
    expect(teachingMeetingLabel(3, 2)).toBe('Week 3 · Class 2');
    expect(teachingMeetingShortLabel(3, 1)).toBe('W3');
    expect(teachingMeetingShortLabel(3, 2)).toBe('W3 · C2');
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

  it('does not count in-progress submissions from created_at alone', () => {
    expect(
      evidenceBelongsToSchoolTerm(
        { created_at: '2026-02-01T00:00:00Z' },
        range,
        { dateStamp: 'graded_submitted' },
      ),
    ).toBe(false);
    expect(
      evidenceBelongsToSchoolTerm(
        { submitted_at: '2026-02-01T00:00:00Z' },
        range,
        { dateStamp: 'graded_submitted' },
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

  it('blocks live-term fallback for duration programmes only', () => {
    expect(allowLiveTermFallback({ academic_model: 'duration_programme' })).toBe(false);
    expect(allowLiveTermFallback({ academic_model: 'termly_school' })).toBe(true);
    expect(allowLiveTermFallback({ academic_offering_id: 'off-1' })).toBe(true);
  });

  it('keeps school submissions that already have a matching term_id even with an offering stamp', () => {
    expect(
      evidenceBelongsToSchoolTerm(
        {
          assignments: {
            term_id: 'term-1',
            academic_offering_id: 'off-school',
          },
          graded_at: '2026-02-01T00:00:00Z',
        },
        range,
      ),
    ).toBe(true);
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
  it('always includes the class meeting', () => {
    expect(pendingWeekKey({ planId: 'p', week: 1, session: 2 })).toBe('p:1:s2');
    expect(pendingWeekKey({ planId: 'p', week: 1 })).toBe('p:1:s1');
  });
});
