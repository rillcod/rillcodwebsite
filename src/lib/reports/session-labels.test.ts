import { describe, expect, it } from 'vitest';
import { isPlaceholderReportSession, resolveClassReportSession } from './session-labels';

describe('session-labels', () => {
  it('flags legacy placeholder sessions', () => {
    expect(isPlaceholderReportSession('Current learning period', '2025/2026')).toBe(true);
    expect(isPlaceholderReportSession('First Term', 'Current programme')).toBe(true);
    expect(isPlaceholderReportSession('First Term', '2025/2026')).toBe(false);
  });

  it('prefers the class academic term over offering labels', () => {
    expect(resolveClassReportSession({
      academicTerm: { term_label: 'Second Term', academic_year: '2025/2026' },
      termId: 'term-1',
      offeringPeriod: { label: 'Summer cohort' },
      offeringTitle: 'Robotics',
      isTermly: false,
    })).toEqual({
      report_term: 'Second Term',
      report_period: '2025/2026',
      term_id: 'term-1',
    });
  });
});
