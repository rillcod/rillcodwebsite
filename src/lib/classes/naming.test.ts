import { describe, expect, it } from 'vitest';
import { buildClassName, cleanClassName, cleanGrade } from './naming';

describe('cleanClassName', () => {
  it.each([
    ['TEEN DEVELOPERS', 'Teen Developers'],
    ['gabus high · teen developers · jss 1-3', 'Gabus High · Teen Developers · JSS 1-3'],
    ['BASIC 1-3', 'Basic 1-3'],
    ['ss 2', 'SS 2'],
    ['  young   innovators  ', 'Young Innovators'],
    ['Word of Faith · Teen Dev · JSS 1-3', 'Word of Faith · Teen Dev · JSS 1-3'],
  ])('normalises %s → %s', (input, expected) => {
    expect(cleanClassName(input)).toBe(expected);
  });
});

describe('cleanGrade', () => {
  it.each([
    ['jss2', 'JSS 2'],
    ['JSS2', 'JSS 2'],
    ['PRIMARY 4', 'Basic 4'],
    ['kg 1', 'Nursery 1'],
    ['sss 3', 'SS 3'],
    ['basic 5', 'Basic 5'],
    ['SS 1-3', 'SS 1'],
    ['Basic 1–3', 'Basic 1'],
  ])('normalises %s → %s', (input, expected) => {
    expect(cleanGrade(input)).toBe(expected);
  });
});

describe('parseBandLabel', () => {
  it('accepts ASCII and en-dash ranges', async () => {
    const { parseBandLabel } = await import('./naming');
    expect(parseBandLabel('Basic 1-3')?.label).toBe('Basic 1-3');
    expect(parseBandLabel('Basic 1–3')?.label).toBe('Basic 1-3');
    expect(parseBandLabel('SS 1-3')?.label).toBe('SS 1-3');
  });
});

describe('buildClassName casing', () => {
  it('title-cases composed class names', () => {
    expect(
      buildClassName({
        schoolName: 'GABUS HIGH SCHOOL',
        programme: 'TEEN DEVELOPERS',
        range: 'jss 1-3',
      }),
    ).toBe('Gabus High · Teen Dev · JSS 1-3');
  });
});
