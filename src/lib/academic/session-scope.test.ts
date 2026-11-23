import { describe, expect, it } from 'vitest';
import {
  classifyStudentSessionStatus,
  getSessionBoundary,
  partitionStudentsBySession,
} from './session-scope';

describe('academic session-scope isolation', () => {
  const boundary = getSessionBoundary('2026/2027');

  it('computes canonical session boundary for an academic year', () => {
    expect(boundary.periodLabel).toBe('2026/2027');
    expect(boundary.previousPeriodLabel).toBe('2025/2026');
    expect(boundary.startYear).toBe(2026);
    expect(boundary.sessionStartIso).toBe('2026-08-01T00:00:00.000Z');
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

  it('isolates prior-session students who have not been confirmed yet as carryover_unconfirmed', () => {
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
});
