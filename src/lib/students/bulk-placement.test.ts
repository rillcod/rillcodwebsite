import { describe, expect, it } from 'vitest';
import {
  bulkClassCoversGrade,
  bulkClassMatchesProgramme,
  bulkGradeBand,
  buildBulkPlacementPool,
  validateBulkClassPlacement,
} from './bulk-placement';

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

  it('rejects a class from another school', () => {
    expect(validateBulkClassPlacement(
      { school_id: 'other', program_id: 'p1', term_id: 't1' },
      { schoolId: 's1', programId: 'p1', termId: 't1' },
    )).toBe('Selected class does not belong to the selected school.');
  });

  it('accepts a class in the selected school', () => {
    expect(validateBulkClassPlacement(
      { school_id: 's1', program_id: 'p1', term_id: 't1' },
      { schoolId: 's1', programId: 'p1', termId: 't1' },
    )).toBeNull();
  });

  it('accepts missing legacy metadata but rejects explicit programme or term conflicts', () => {
    expect(validateBulkClassPlacement(
      { school_id: 's1', program_id: null, term_id: null },
      { schoolId: 's1', programId: 'p1', termId: 't1' },
    )).toBeNull();
    expect(validateBulkClassPlacement(
      { school_id: null, program_id: 'other', term_id: 'other' },
      { schoolId: 's1', programId: 'p1', termId: 't1' },
    )).toBe('Selected class does not belong to the selected programme.');
    expect(validateBulkClassPlacement(
      { school_id: 's1', program_id: 'other', term_id: 'other' },
      { schoolId: 's1', programId: 'p1', termId: 't1' },
    )).toBe('Selected class does not belong to the selected programme.');
  });

  it('matches legacy class names that include the grade band', () => {
    expect(bulkClassCoversGrade({ name: 'Greenfield — Basic 1-3' }, 'Basic 2')).toBe(true);
    expect(bulkClassCoversGrade({ name: 'JSS 2A Coding' }, 'JSS 2')).toBe(true);
  });

  it('matches Young Innov style class names to Young Innovators', () => {
    expect(bulkClassMatchesProgramme(
      { name: 'Young Innov 3', program_id: 'other' },
      'yi',
      'Young Innovators',
    )).toBe(true);
  });

  it('lists every school class and only prefers a class when programme and term both match', () => {
    const classes = [
      { id: '1', name: 'Young Innov 3', school_id: 's1', program_id: 'stale', term_id: 'old' },
      { id: '2', name: 'Teen Dev JSS', school_id: 's1', program_id: 'yi', term_id: 't1' },
    ];
    const { pool, preferredIds, usingProgrammeFallback } = buildBulkPlacementPool(classes, {
      schoolId: 's1',
      programId: 'yi',
      programName: 'Young Innovators',
      termId: 't1',
    });
    expect(usingProgrammeFallback).toBe(false);
    expect(pool.map((c) => c.id).sort()).toEqual(['1', '2']);
    expect(preferredIds.has('1')).toBe(false); // programme name matches, but the term conflicts
    expect(preferredIds.has('2')).toBe(true); // program id matches
  });
});
