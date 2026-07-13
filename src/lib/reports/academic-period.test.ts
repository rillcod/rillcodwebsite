import { describe, expect, it } from 'vitest';
import {
  compareSessions,
  isStaleAcademicSession,
  liveAcademicSession,
  resolveSessionForWrite,
  sessionIdentityKey,
  sessionsEqual,
  wouldRewriteSessionIdentity,
  coverageSessionOrFilter,
} from './academic-period';

describe('academic session identity isolation', () => {
  it('keeps Second Term and Third Term as different identities', () => {
    const second = { termLabel: 'Second Term', periodLabel: '2025/2026' };
    const third = { termLabel: 'Third Term', periodLabel: '2025/2026' };
    expect(sessionsEqual(second, third)).toBe(false);
    expect(sessionIdentityKey(second)).not.toBe(sessionIdentityKey(third));
    expect(compareSessions(second, third)).toBeLessThan(0);
  });

  it('keeps First Term across academic years isolated', () => {
    const thisYear = { termLabel: 'First Term', periodLabel: '2025/2026' };
    const nextYear = { termLabel: 'First Term', periodLabel: '2026/2027' };
    expect(sessionsEqual(thisYear, nextYear)).toBe(false);
    expect(sessionIdentityKey(thisYear)).not.toBe(sessionIdentityKey(nextYear));
    expect(isStaleAcademicSession('First Term', '2025/2026', 'First Term', '2026/2027')).toBe(true);
    // Future next-year First while still in current Third is NOT stale.
    expect(isStaleAcademicSession('First Term', '2026/2027', 'Third Term', '2025/2026')).toBe(false);
  });

  it('rolls Second→Third for writes but never invents a hybrid year', () => {
    const live = { termLabel: 'Third Term', periodLabel: '2025/2026' };
    const rolled = resolveSessionForWrite('Second Term', '2025/2026', { live });
    expect(rolled.rolled).toBe(true);
    expect(rolled.session).toEqual(live);

    const future = resolveSessionForWrite('First Term', '2026/2027', { live });
    expect(future.rolled).toBe(false);
    expect(future.session).toEqual({ termLabel: 'First Term', periodLabel: '2026/2027' });
  });

  it('detects in-place rewrite across session identity', () => {
    expect(
      wouldRewriteSessionIdentity(
        { report_term: 'Second Term', report_period: '2025/2026' },
        { termLabel: 'Third Term', periodLabel: '2025/2026' },
      ),
    ).toBe(true);
    expect(
      wouldRewriteSessionIdentity(
        { report_term: 'Third Term', report_period: '2025/2026' },
        { termLabel: 'Third Term', periodLabel: '2025/2026' },
      ),
    ).toBe(false);
  });

  it('builds coverage OR filter with both labels so years cannot collide', () => {
    const filter = coverageSessionOrFilter({
      termId: 'term-uuid',
      termLabel: 'Third Term',
      periodLabel: '2025/2026',
    });
    expect(filter).toContain('term_id.eq.term-uuid');
    expect(filter).toContain('report_term.eq."Third Term"');
    expect(filter).toContain('report_period.eq."2025/2026"');
  });

  it('liveAcademicSession stays a pure (term, year) pair', () => {
    // July → Third Term of prior/current academic year pair.
    const july = liveAcademicSession(new Date('2026-07-13T12:00:00Z'));
    expect(july).toEqual({ termLabel: 'Third Term', periodLabel: '2025/2026' });

    const sept = liveAcademicSession(new Date('2026-09-05T12:00:00Z'));
    expect(sept).toEqual({ termLabel: 'First Term', periodLabel: '2026/2027' });
  });
});
