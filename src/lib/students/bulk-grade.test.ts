import { describe, expect, it } from 'vitest';
import { fixedBand } from '@/lib/classes/naming';
import { isBulkGradeHeader, parseBulkGrade, stripBulkGrade } from './bulk-grade';

describe('bulk registration grade parsing', () => {
  it.each([
    ['KG2B', { grade: 'Nursery 2', arm: 'B' }],
    ['Nursery 3', { grade: 'Nursery 3', arm: null }],
    ['PRIMARY 4A', { grade: 'Basic 4', arm: 'A' }],
    ['JSS2C', { grade: 'JSS 2', arm: 'C' }],
    ['SSS 1', { grade: 'SS 1', arm: null }],
  ])('normalizes %s into canonical grade and separate arm', (input, expected) => {
    expect(parseBulkGrade(input)).toEqual(expected);
  });

  it('recognizes a grade-only header and strips inline grade text from a name', () => {
    expect(isBulkGradeHeader('KG 1A:')).toBe(true);
    expect(stripBulkGrade('Ada Okafor KG 1A')).toBe('Ada Okafor');
  });

  it('uses the canonical Nursery 1-3 fixed band', () => {
    expect(fixedBand('Nursery 3')).toEqual({
      lvl: 'Nursery',
      low: 1,
      high: 3,
      label: 'Nursery 1-3',
    });
  });
});

