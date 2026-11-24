import { describe, expect, it } from 'vitest';
import {
  classifyStudentSessionStatus,
  getSessionBoundary,
  isStudentInCurrentSession,
  partitionStudentsBySession,
  rosterRowEffectiveMs,
  shouldReplaceRosterRow,
} from './session-scope';

describe('academic session-scope isolation', () => {
  const boundary = getSessionBoundary('2026/2027');

  it('computes canonical session boundary for an academic year (September 1 start)', () => {
    expect(boundary.periodLabel).toBe('2026/2027');
    expect(boundary.previousPeriodLabel).toBe('2025/2026');
    expect(boundary.startYear).toBe(2026);
    expect(boundary.sessionStartIso).toBe('2026-09-01T00:00:00.000Z');
  });

  it('marks inactive or withdrawn students as withdrawn so they never pollute active counts', () => {
    expect(
      classifyStudentSessionStatus(
        { is_active: false, created_at: '2026-09-10T00:00:00.000Z' },
        { status: 'active' },
        { boundary },
      ),
    ).toBe('withdrawn');

    expect(
      classifyStudentSessionStatus(
        { is_active: true, created_at: '2026-09-10T00:00:00.000Z' },
        { status: 'withdrawn' },
        { boundary },
      ),
    ).toBe('withdrawn');
  });

  it('marks students confirmed for current session or enrolled on/after session start as confirmed_current', () => {
    expect(
      classifyStudentSessionStatus(
        {
          is_active: true,
          created_at: '2025-09-10T00:00:00.000Z',
          metadata: { confirmed_session: '2026/2027' },
        },
        null,
        { boundary },
      ),
    ).toBe('confirmed_current');

    expect(
      classifyStudentSessionStatus(
        {
          is_active: true,
          created_at: '2026-09-12T08:00:00.000Z',
          metadata: {},
        },
        null,
        { boundary },
      ),
    ).toBe('confirmed_current');
  });

  it('isolates prior-session students (including August 3rd-term backfills with new term_id) as carryover_unconfirmed', () => {
    expect(
      classifyStudentSessionStatus(
        {
          is_active: true,
          created_at: '2025-10-01T08:00:00.000Z',
          metadata: { confirmed_session: '2025/2026' },
        },
        { status: 'active', term_id: 'old-term', started_at: '2025-10-01T08:00:00.000Z' },
        { canonicalTermId: 'new-term', boundary },
      ),
    ).toBe('carryover_unconfirmed');

    // Regression guard: St Peter / 3rd-term students created in July 2026 whose roster
    // was bulk-backfilled on 2026-08-08 with First Term's term_id must remain carryover_unconfirmed!
    expect(
      classifyStudentSessionStatus(
        {
          is_active: true,
          created_at: '2026-07-10T08:58:52.000Z',
          metadata: null,
        },
        {
          status: 'active',
          term_id: 'new-term',
          started_at: '2026-08-08T04:34:01.000Z',
        },
        { canonicalTermId: 'new-term', boundary },
      ),
    ).toBe('carryover_unconfirmed');
  });

  it('partitions mixed class rosters into clean non-overlapping buckets', () => {
    const result = partitionStudentsBySession([
      { id: '1', session_status: 'confirmed_current' },
      { id: '2', session_status: 'carryover_unconfirmed' },
      { id: '3', session_status: 'carryover_unconfirmed' },
      { id: '4', session_status: 'withdrawn' },
    ]);
    expect(result.currentSession).toHaveLength(1);
    expect(result.carryoverUnconfirmed).toHaveLength(2);
    expect(result.withdrawn).toHaveLength(1);
  });

  it('evaluates isStudentInCurrentSession across session_status, metadata, and created_at', () => {
    expect(isStudentInCurrentSession(null, boundary)).toBe(false);
    expect(isStudentInCurrentSession({ session_status: 'confirmed_current' }, boundary)).toBe(true);
    expect(isStudentInCurrentSession({ session_status: 'carryover_unconfirmed', created_at: '2026-10-01T00:00:00.000Z' }, boundary)).toBe(false);
    expect(isStudentInCurrentSession({ session_status: 'withdrawn', metadata: { confirmed_session: '2026/2027' } }, boundary)).toBe(false);

    // Metadata confirmation / rollover / history
    expect(isStudentInCurrentSession({ created_at: '2025-09-01T00:00:00.000Z', metadata: { confirmed_session: '2026/2027' } }, boundary)).toBe(true);
    expect(isStudentInCurrentSession({ created_at: '2025-09-01T00:00:00.000Z', metadata: { rollover_session: '2026/2027' } }, boundary)).toBe(true);
    expect(
      isStudentInCurrentSession(
        { created_at: '2025-09-01T00:00:00.000Z', metadata: { session_history: [{ session: '2026/2027' }] } },
        boundary,
      ),
    ).toBe(true);

    // Created_at boundary (Sep 1 cutoff — August is still 3rd Term)
    expect(isStudentInCurrentSession({ created_at: '2026-09-01T00:00:00.000Z', metadata: {} }, boundary)).toBe(true);
    expect(isStudentInCurrentSession({ created_at: '2026-08-31T23:59:59.000Z', metadata: {} }, boundary)).toBe(false);
  });

  it('automatically isolates 2026/2027 students as carryover when the calendar rolls to 2027/2028', () => {
    const nextBoundary = getSessionBoundary('2027/2028');
    expect(nextBoundary.previousPeriodLabel).toBe('2026/2027');
    expect(nextBoundary.sessionStartIso).toBe('2027-09-01T00:00:00.000Z');

    const studentFrom2026 = {
      is_active: true,
      created_at: '2026-09-15T10:00:00.000Z',
      metadata: {
        confirmed_session: '2026/2027',
        rollover_session: '2026/2027',
        session_history: [{ session: '2026/2027' }],
      },
    };

    // Confirmed during 2026/2027
    expect(classifyStudentSessionStatus(studentFrom2026, { status: 'active', started_at: '2026-09-15T10:00:00.000Z' }, { boundary })).toBe('confirmed_current');
    expect(isStudentInCurrentSession(studentFrom2026, boundary)).toBe(true);

    // Automatically carryover_unconfirmed in 2027/2028 with zero manual reset
    expect(classifyStudentSessionStatus(studentFrom2026, { status: 'active', started_at: '2026-09-15T10:00:00.000Z' }, { boundary: nextBoundary })).toBe('carryover_unconfirmed');
    expect(isStudentInCurrentSession(studentFrom2026, nextBoundary)).toBe(false);

    // Once rolled over or confirmed for 2027/2028, immediately confirmed_current again
    const rolledTo2027 = {
      ...studentFrom2026,
      metadata: {
        ...studentFrom2026.metadata,
        confirmed_session: '2027/2028',
        session_history: [{ session: '2026/2027' }, { session: '2027/2028' }],
      },
    };
    expect(classifyStudentSessionStatus(rolledTo2027, { status: 'active' }, { boundary: nextBoundary })).toBe('confirmed_current');
    expect(isStudentInCurrentSession(rolledTo2027, nextBoundary)).toBe(true);
  });

  it('resolves duplicate class_term_rosters rows so a newer withdrawn row overrides an older 3rd-term active row', () => {
    const oldThirdTermActive = {
      class_id: 'winrose-class',
      status: 'active',
      term_id: 'third-term-2025-2026',
      started_at: '2026-03-25T10:00:00.000Z',
      ended_at: null,
      reinstated_at: null,
    };
    const newerFirstTermWithdrawn = {
      class_id: 'winrose-class',
      status: 'withdrawn',
      term_id: 'first-term-2026-2027',
      started_at: '2026-08-08T04:34:01.000Z',
      ended_at: '2026-11-23T14:22:00.000Z',
      reinstated_at: null,
    };

    expect(rosterRowEffectiveMs(newerFirstTermWithdrawn)).toBeGreaterThan(
      rosterRowEffectiveMs(oldThirdTermActive),
    );
    expect(shouldReplaceRosterRow(oldThirdTermActive, newerFirstTermWithdrawn, 'winrose-class')).toBe(true);
    expect(shouldReplaceRosterRow(newerFirstTermWithdrawn, oldThirdTermActive, 'winrose-class')).toBe(false);
    expect(
      classifyStudentSessionStatus(
        { is_active: true, created_at: '2026-03-25T10:00:00.000Z', metadata: null },
        newerFirstTermWithdrawn,
        { boundary },
      ),
    ).toBe('withdrawn');
  });
});
