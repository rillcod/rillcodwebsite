import { describe, expect, it } from 'vitest';
import {
  attendanceSourceMessage,
  DRAFT_SNAPSHOT_STALE_AFTER_MS,
  hasRequiredSourceFailures,
  isDraftSnapshotStale,
  recordSource,
  snapshotAgeLabel,
} from './source-query';

describe('source-query ledger', () => {
  it('records failed required sources', () => {
    const status = recordSource('students', {
      error: { message: 'timeout' },
      required: true,
    });
    expect(status.status).toBe('failed');
    expect(status.required).toBe(true);
    expect(hasRequiredSourceFailures([status])).toBe(true);
  });

  it('marks empty optional sources without blocking', () => {
    const status = recordSource('attendance', { rows: [], required: false });
    expect(status.status).toBe('empty');
    expect(hasRequiredSourceFailures([status])).toBe(false);
  });

  it('marks capped rows as partial', () => {
    const status = recordSource('submissions', {
      rows: Array.from({ length: 10000 }, (_, i) => ({ id: i })),
      cap: 10000,
    });
    expect(status.status).toBe('partial');
    expect(status.capped).toBe(true);
  });

  it('keeps a staff-facing message on empty attendance instead of the generic copy', () => {
    const status = recordSource('attendance', {
      rows: [],
      required: true,
      message: attendanceSourceMessage(0, 0),
    });
    expect(status.status).toBe('empty');
    expect(status.message).toMatch(/No class-roll marks or Report Builder/);
  });

  it('counts result-entry scores as attendance coverage in the ledger message', () => {
    expect(attendanceSourceMessage(0, 4)).toContain('0 class-roll marks');
    expect(attendanceSourceMessage(0, 4)).toContain('4 result-entry attendance scores');
  });
});

describe('draft snapshot freshness', () => {
  const now = Date.parse('2026-08-19T12:00:00.000Z');

  it('treats missing or unreadable generatedAt as stale', () => {
    expect(isDraftSnapshotStale(null, now)).toBe(true);
    expect(isDraftSnapshotStale('not-a-date', now)).toBe(true);
  });

  it('flags snapshots older than twelve hours', () => {
    const staleAt = new Date(now - DRAFT_SNAPSHOT_STALE_AFTER_MS - 1).toISOString();
    const freshAt = new Date(now - DRAFT_SNAPSHOT_STALE_AFTER_MS + 60_000).toISOString();
    expect(isDraftSnapshotStale(staleAt, now)).toBe(true);
    expect(isDraftSnapshotStale(freshAt, now)).toBe(false);
  });

  it('labels snapshot age in hours or days', () => {
    expect(snapshotAgeLabel(new Date(now - 30 * 60_000).toISOString(), now)).toBe('less than an hour ago');
    expect(snapshotAgeLabel(new Date(now - 5 * 3_600_000).toISOString(), now)).toBe('5 hours ago');
    expect(snapshotAgeLabel(new Date(now - 2 * 24 * 3_600_000).toISOString(), now)).toBe('2 days ago');
  });
});
