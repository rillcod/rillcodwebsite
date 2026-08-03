import { describe, expect, it } from 'vitest';
import {
  isSessionJoinWindowOpen,
  JOIN_EARLY_MS,
  JOIN_LATE_GRACE_MS,
  type LiveSessionScope,
} from './authz';

/**
 * The gate deciding whether a student may enter a session the host has not started.
 *
 * It previously selected scheduled_at and duration_minutes and ignored both, so it reduced to
 * "not completed/cancelled" — a student could walk into a session scheduled for next month
 * while the 403 told them it was "not open for joining yet".
 */

const MIN = 60_000;
const at = (iso: string): number => new Date(iso).getTime();
const START = '2026-08-03T10:00:00.000Z';

function session(over: Partial<LiveSessionScope> = {}): LiveSessionScope {
  return {
    id: 's1',
    host_id: 'h1',
    school_id: null,
    program_id: null,
    status: 'scheduled',
    scheduled_at: START,
    duration_minutes: 60,
    ...over,
  };
}

describe('isSessionJoinWindowOpen — a session the host started', () => {
  it('is always open, however long it has overrun', () => {
    // A class running past its nominal duration must never eject the students sitting in it.
    const live = session({ status: 'live' });
    expect(isSessionJoinWindowOpen(live, at(START) + 8 * 60 * MIN)).toBe(true);
    expect(isSessionJoinWindowOpen(live, at(START) + 400 * 60 * MIN)).toBe(true);
  });
});

describe('isSessionJoinWindowOpen — a scheduled session', () => {
  it('opens JOIN_EARLY_MS before the start, not before', () => {
    expect(isSessionJoinWindowOpen(session(), at(START) - JOIN_EARLY_MS + 1000)).toBe(true);
    expect(isSessionJoinWindowOpen(session(), at(START) - JOIN_EARLY_MS - 1000)).toBe(false);
  });

  it('is open across the lesson itself', () => {
    expect(isSessionJoinWindowOpen(session(), at(START))).toBe(true);
    expect(isSessionJoinWindowOpen(session(), at(START) + 30 * MIN)).toBe(true);
  });

  it('stays open for a generous grace past the nominal end', () => {
    const end = at(START) + 60 * MIN;
    expect(isSessionJoinWindowOpen(session(), end + JOIN_LATE_GRACE_MS - 1000)).toBe(true);
    expect(isSessionJoinWindowOpen(session(), end + JOIN_LATE_GRACE_MS + 1000)).toBe(false);
  });

  it('refuses a session scheduled next month — the bug this replaces', () => {
    expect(isSessionJoinWindowOpen(session(), at(START) - 30 * 24 * 60 * MIN)).toBe(false);
  });

  it('respects the session-specific duration', () => {
    const long = session({ duration_minutes: 200 });
    const pastShortEnd = at(START) + 60 * MIN + JOIN_LATE_GRACE_MS + MIN;
    expect(isSessionJoinWindowOpen(long, pastShortEnd)).toBe(true);
    expect(isSessionJoinWindowOpen(session(), pastShortEnd)).toBe(false);
  });

  it('falls back to 60 minutes when duration is missing', () => {
    const noDuration = session({ duration_minutes: null });
    const end = at(START) + 60 * MIN;
    expect(isSessionJoinWindowOpen(noDuration, end + JOIN_LATE_GRACE_MS - 1000)).toBe(true);
    expect(isSessionJoinWindowOpen(noDuration, end + JOIN_LATE_GRACE_MS + 1000)).toBe(false);
  });

  it('fails OPEN when there is no usable schedule', () => {
    // Better a joinable dead room than a class nobody can enter because of a bad timestamp.
    expect(isSessionJoinWindowOpen(session({ scheduled_at: null }), at(START))).toBe(true);
    expect(isSessionJoinWindowOpen(session({ scheduled_at: 'not-a-date' }), at(START))).toBe(true);
  });
});

describe('isSessionJoinWindowOpen — finished sessions', () => {
  it('is never open once completed or cancelled', () => {
    for (const status of ['completed', 'cancelled'] as const) {
      expect(isSessionJoinWindowOpen(session({ status }), at(START))).toBe(false);
    }
  });
});

describe('window vs auto-close grace', () => {
  it('the sweep waits longer than the join window stays open', () => {
    // closeOverdueSessions() uses a 6h grace; if it were shorter than JOIN_LATE_GRACE_MS the
    // cron could complete a session a student was still allowed to be joining.
    expect(6 * 60 * 60_000).toBeGreaterThan(JOIN_LATE_GRACE_MS);
  });
});
