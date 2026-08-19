import { describe, expect, it } from 'vitest';
import {
  compareSessions,
  academicSessionDrift,
  isFutureAcademicSession,
  isStaleAcademicSession,
  liveAcademicSession,
  nextAcademicSession,
  resolveSessionForWrite,
  sessionIdentityKey,
  sessionsEqual,
  wouldRewriteSessionIdentity,
  coverageSessionOrFilter,
  schoolSessionDisplay,
  liveSchoolTermRef,
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

    // Next year's First Term used to pass through untouched. It no longer may:
    // a score cannot belong to a term that has not started, and the database
    // refuses it, so the write path corrects it to live rather than erroring.
    const future = resolveSessionForWrite('First Term', '2026/2027', { live });
    expect(future.rolled).toBe(true);
    expect(future.session).toEqual(live);
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

  it('keeps a stored prior session when the write is an explicit backfill', () => {
    const live = { termLabel: 'First Term', periodLabel: '2026/2027' };
    const kept = resolveSessionForWrite('Third Term', '2025/2026', { allowBackfill: true, live });
    expect(kept.rolled).toBe(false);
    expect(kept.session).toEqual({ termLabel: 'Third Term', periodLabel: '2025/2026' });
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

  it('advances Third Term into next-year First Term', () => {
    const next = nextAcademicSession({ termLabel: 'Third Term', periodLabel: '2025/2026' });
    expect(next).toEqual({ termLabel: 'First Term', periodLabel: '2026/2027' });
    const mid = nextAcademicSession({ termLabel: 'Second Term', periodLabel: '2025/2026' });
    expect(mid).toEqual({ termLabel: 'Third Term', periodLabel: '2025/2026' });
  });

  it('liveAcademicSession stays a pure (term, year) pair', () => {
    // July → Third Term of prior/current academic year pair.
    const july = liveAcademicSession(new Date('2026-07-13T12:00:00Z'));
    expect(july).toEqual({ termLabel: 'Third Term', periodLabel: '2025/2026' });

    const sept = liveAcademicSession(new Date('2026-09-05T12:00:00Z'));
    expect(sept).toEqual({ termLabel: 'First Term', periodLabel: '2026/2027' });
  });

  it('finance school term ref tracks live session without inventing future First', () => {
    const ref = liveSchoolTermRef(new Date('2026-07-13T12:00:00Z'));
    expect(ref).toEqual({
      academicYear: '2025',
      termNumber: '3',
      periodLabel: '2025/2026',
      termLabel: 'Third Term',
    });
    expect(schoolSessionDisplay('2025', '3')).toBe('2025/2026 · Third Term');
    expect(schoolSessionDisplay('2026/2027', '1')).toBe('2026/2027 · First Term');
  });
});

describe('forward session drift (the direction nothing watched)', () => {
  const LIVE_TERM = 'Third Term';
  const LIVE_YEAR = '2025/2026';

  it('detects a session a whole year ahead', () => {
    // The real shape: same term label, next academic year, so the screen looked right.
    expect(isFutureAcademicSession('Third Term', '2026/2027', LIVE_TERM, LIVE_YEAR)).toBe(true);
    expect(isFutureAcademicSession('Second Term', '2026/2027', LIVE_TERM, LIVE_YEAR)).toBe(true);
  });

  it('treats a later term in the SAME year as future too', () => {
    // Third Term while the calendar still says Second means Third has not
    // started, so a score cannot belong to it — the same rule the database
    // enforces, not a special case for crossing a year boundary.
    expect(isFutureAcademicSession('Third Term', '2025/2026', 'Second Term', LIVE_YEAR)).toBe(true);
  });

  it('does not treat the live or a past session as future', () => {
    expect(isFutureAcademicSession(LIVE_TERM, LIVE_YEAR, LIVE_TERM, LIVE_YEAR)).toBe(false);
    expect(isFutureAcademicSession('Third Term', '2024/2025', LIVE_TERM, LIVE_YEAR)).toBe(false);
  });

  it('reports drift direction in one call', () => {
    expect(academicSessionDrift('Third Term', '2026/2027', LIVE_TERM, LIVE_YEAR)).toBe('ahead');
    expect(academicSessionDrift('First Term', '2024/2025', LIVE_TERM, LIVE_YEAR)).toBe('behind');
    expect(academicSessionDrift(LIVE_TERM, LIVE_YEAR, LIVE_TERM, LIVE_YEAR)).toBe('live');
  });

  it('pulls a future session back to live on write', () => {
    const out = resolveSessionForWrite('Third Term', '2026/2027', {
      live: { termLabel: LIVE_TERM, periodLabel: LIVE_YEAR },
    });
    expect(out.rolled).toBe(true);
    expect(out.session.periodLabel).toBe(LIVE_YEAR);
  });

  it('backfill unlocks the past but never the future', () => {
    // allowBackfill means "record history", so it must not wave a future year through.
    const past = resolveSessionForWrite('First Term', '2024/2025', {
      allowBackfill: true, live: { termLabel: LIVE_TERM, periodLabel: LIVE_YEAR },
    });
    expect(past.session.periodLabel).toBe('2024/2025');
  });
});

describe('one session ahead stays legitimate', () => {
  const LIVE = { termLabel: 'Third Term', periodLabel: '2025/2026' };

  it('refuses next year First Term — that term has not started', () => {
    expect(isFutureAcademicSession('First Term', '2026/2027', LIVE.termLabel, LIVE.periodLabel)).toBe(true);
    const out = resolveSessionForWrite('First Term', '2026/2027', { live: LIVE });
    expect(out.rolled).toBe(true);
    expect(out.session).toEqual(LIVE);
  });

  it('rejects two or more sessions ahead — the shape that actually drifted', () => {
    // 60 reports landed on Second Term next year (two ahead), 16 on Third (three).
    expect(isFutureAcademicSession('Second Term', '2026/2027', LIVE.termLabel, LIVE.periodLabel)).toBe(true);
    expect(isFutureAcademicSession('Third Term', '2026/2027', LIVE.termLabel, LIVE.periodLabel)).toBe(true);
    expect(resolveSessionForWrite('Second Term', '2026/2027', { live: LIVE }).rolled).toBe(true);
  });
});
