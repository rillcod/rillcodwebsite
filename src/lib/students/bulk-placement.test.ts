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

  it('rejects a class from another school or programme', () => {
    expect(validateBulkClassPlacement(
      { school_id: 'other', program_id: 'p1', term_id: 't1' },
      { schoolId: 's1', programId: 'p1', termId: 't1' },
    )).toBe('Selected class does not belong to the selected school.');
    expect(validateBulkClassPlacement(
      { school_id: 's1', program_id: 'other', term_id: 't1' },
      { schoolId: 's1', programId: 'p1', termId: 't1' },
    )).toBe('Selected class does not belong to the selected programme.');
  });

  it('accepts a class in the selected school, programme and term', () => {
    expect(validateBulkClassPlacement(
      { school_id: 's1', program_id: 'p1', term_id: 't1' },
      { schoolId: 's1', programId: 'p1', termId: 't1' },
    )).toBeNull();
  });

  it('accepts legacy null programme and term mismatch for owned classes', () => {
    expect(validateBulkClassPlacement(
      { school_id: 's1', program_id: null, term_id: null },
      { schoolId: 's1', programId: 'p1', termId: 't1' },
    )).toBeNull();
    expect(validateBulkClassPlacement(
      { school_id: 's1', program_id: 'p1', term_id: 'other' },
      { schoolId: 's1', programId: 'p1', termId: 't1' },
    )).toBeNull();
  });

  it('matches legacy class names that include the grade band', () => {
    expect(bulkClassCoversGrade({ name: 'Greenfield — Basic 1-3' }, 'Basic 2')).toBe(true);
    expect(bulkClassCoversGrade({ name: 'JSS 2A Coding' }, 'JSS 2')).toBe(true);
  });
});

