import { describe, expect, it } from 'vitest';
import {
  classSessionFromTerms,
  formatClassOptionLabel,
  liveSessionLike,
  parseCanonicalTermLabel,
  reportMatchesSession,
  resolveSmartWorkingSession,
  sessionFromReport,
} from './session-scope';

describe('session-scope helpers', () => {
  it('classSessionFromTerms returns null when incomplete', () => {
    expect(classSessionFromTerms(null)).toBeNull();
    expect(classSessionFromTerms({ term_label: 'First Term' })).toBeNull();
  });

  it('classSessionFromTerms extracts a full assignment pair', () => {
    expect(classSessionFromTerms({ term_label: 'Third Term', academic_year: '2024/2025' })).toEqual({
      term: 'Third Term',
      period: '2024/2025',
    });
  });

  it('parseCanonicalTermLabel handles full and partial labels', () => {
    expect(parseCanonicalTermLabel('First Term 2025/2026')).toEqual({
      term: 'First Term',
      period: '2025/2026',
    });
    expect(parseCanonicalTermLabel('Second Term', '2024/2025')).toEqual({
      term: 'Second Term',
      period: '2024/2025',
    });
    expect(parseCanonicalTermLabel('Annual')).toBeNull();
  });

  it('resolveSmartWorkingSession prefers class assignment when locked', () => {
    expect(resolveSmartWorkingSession({
      classSession: { term: 'Third Term', period: '2024/2025' },
      saved: { term: 'First Term', period: '2025/2026' },
      periodUnlocked: false,
    })).toEqual({ term: 'Third Term', period: '2024/2025' });
  });

  it('resolveSmartWorkingSession keeps teacher pick when period is unlocked', () => {
    expect(resolveSmartWorkingSession({
      classSession: { term: 'First Term', period: '2025/2026' },
      saved: { term: 'Third Term', period: '2024/2025' },
      periodUnlocked: true,
    })).toEqual({ term: 'Third Term', period: '2024/2025' });
  });

  it('reportMatchesSession rejects cross-term bleed when scope is set', () => {
    const thirdTermReport = { term: 'Third Term', period: '2024/2025' };
    const firstTermClass = { term: 'First Term', period: '2025/2026' };
    expect(reportMatchesSession(thirdTermReport, firstTermClass)).toBe(false);
    expect(reportMatchesSession(thirdTermReport, thirdTermReport)).toBe(true);
    expect(reportMatchesSession(thirdTermReport, null)).toBe(true);
  });

  it('sessionFromReport and liveSessionLike stay paired', () => {
    expect(sessionFromReport({ report_term: 'Second Term', report_period: '2025/2026' })).toEqual({
      term: 'Second Term',
      period: '2025/2026',
    });
    expect(sessionFromReport({ report_term: 'Second Term' })).toBeNull();
    const live = liveSessionLike(new Date('2026-10-01T12:00:00Z'));
    expect(live.term).toBe('First Term');
    expect(live.period).toMatch(/\d{4}\/\d{4}/);
  });

  it('formatClassOptionLabel appends assignment suffix', () => {
    expect(formatClassOptionLabel('JSS1A', 'First Term', '2025/2026')).toContain('JSS1A');
    expect(formatClassOptionLabel('JSS1A', 'First Term', '2025/2026')).toContain('class assignment');
  });
});
