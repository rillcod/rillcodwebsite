import { describe, expect, it } from 'vitest';
import { bulkClassCoversGrade, bulkGradeBand, validateBulkClassPlacement } from './bulk-placement';

describe('bulk registration placement', () => {
  it('groups canonical grades into fixed bands', () => {
    expect(bulkGradeBand('Nursery 2')).toBe('Nursery 1-3');
    expect(bulkGradeBand('Basic 2')).toBe('Basic 1-3');
    expect(bulkGradeBand('Basic 5')).toBe('Basic 4-6');
    expect(bulkGradeBand('JSS 3')).toBe('JSS 1-3');
  });

  it('matches students only to classes whose numeric band covers their grade', () => {
    const lowerBasic = { band_lvl: 'Basic', band_low: 1, band_high: 3 };
    expect(bulkClassCoversGrade(lowerBasic, 'Basic 2')).toBe(true);
    expect(bulkClassCoversGrade(lowerBasic, 'Basic 5')).toBe(false);
  });

  it.each([
    [
      { school_id: 'other', program_id: 'p1', term_id: 't1' },
      'Selected class does not belong to the selected school.',
    ],
    [
      { school_id: 's1', program_id: 'other', term_id: 't1' },
      'Selected class does not belong to the selected programme.',
    ],
    [
      { school_id: 's1', program_id: 'p1', term_id: 'other' },
      'Selected class does not belong to the selected academic term.',
    ],
  ])('rejects an inaccessible or mismatched class', (cls, message) => {
    expect(validateBulkClassPlacement(cls, { schoolId: 's1', programId: 'p1', termId: 't1' })).toBe(message);
  });

  it('accepts a class in the selected school, programme and term', () => {
    expect(validateBulkClassPlacement(
      { school_id: 's1', program_id: 'p1', term_id: 't1' },
      { schoolId: 's1', programId: 'p1', termId: 't1' },
    )).toBeNull();
  });
});

