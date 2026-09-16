import { describe, expect, it } from 'vitest';
import { matchesReportFilter, reportBucket } from './report-status';

describe('Card Studio report filters', () => {
  it('includes students without reports in No report', () => {
    expect(matchesReportFilter({}, 'no_report')).toBe(true);
    expect(matchesReportFilter({ has_draft_report: true }, 'no_report')).toBe(false);
    expect(matchesReportFilter({ has_published_report: true }, 'no_report')).toBe(false);
  });
  it('prioritizes published reports over drafts consistently', () => {
    const report = { has_published_report: true, has_draft_report: true };
    expect(reportBucket(report)).toBe('published');
    expect(matchesReportFilter(report, 'published')).toBe(true);
    expect(matchesReportFilter(report, 'draft')).toBe(false);
  });
  it('includes all states in All and drafts in Draft', () => {
    for (const report of [{}, { has_draft_report: true }, { has_published_report: true }]) {
      expect(matchesReportFilter(report, 'all')).toBe(true);
    }
    expect(matchesReportFilter({ has_draft_report: true }, 'draft')).toBe(true);
  });
});
