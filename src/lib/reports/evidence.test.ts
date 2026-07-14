import { describe, expect, it } from 'vitest';
import { evidencePercentage, isEvidenceWithinPeriod, relevantAssignmentsForReport } from './evidence';

describe('report evidence scoping', () => {
  it('keeps global and matching-class assignments only for the selected term', () => {
    const rows = [
      { id: 'global', class_id: null, term_id: 'term-1' },
      { id: 'mine', class_id: 'class-1', term_id: 'term-1' },
      { id: 'other-class', class_id: 'class-2', term_id: 'term-1' },
      { id: 'old-term', class_id: 'class-1', term_id: 'term-0' },
    ];
    expect(relevantAssignmentsForReport(rows, 'class-1', 'term-1').map(row => row.id)).toEqual(['global', 'mine']);
  });
  it('returns no assignments when termId is missing (refuse cross-session bleed)', () => {
    const rows = [
      { id: 'global', class_id: null, term_id: 'term-1' },
      { id: 'mine', class_id: 'class-1', term_id: 'term-1' },
    ];
    expect(relevantAssignmentsForReport(rows, 'class-1', null)).toEqual([]);
  });
  it('returns zero instead of inventing a percentage when evidence has no denominator', () => {
    expect(evidencePercentage(0, 0)).toBe(0);
    expect(evidencePercentage(4, 5)).toBe(80);
  });
  it('keeps CBT evidence inside the academic term date range', () => {
    expect(isEvidenceWithinPeriod('2026-10-15T12:00:00Z', '2026-09-01', '2026-12-20')).toBe(true);
    expect(isEvidenceWithinPeriod('2027-01-10T12:00:00Z', '2026-09-01', '2026-12-20')).toBe(false);
  });
});