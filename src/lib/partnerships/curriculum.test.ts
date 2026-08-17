import { describe, expect, it } from 'vitest';

import { PARTNERSHIP_OFFERS } from './offers';
import { levelsForQuote, type ProgressionLevel } from './curriculum';

const GRADES = [
  'Basic 1', 'Basic 2', 'Basic 3', 'Basic 4', 'Basic 5', 'Basic 6',
  'JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3',
];

const levels: ProgressionLevel[] = GRADES.map((grade, i) => ({
  year_number: i + 1,
  grade,
  theme: grade,
  terms: [],
  capstone: null,
  portfolio: null,
}));

const offerA = PARTNERSHIP_OFFERS.find((o) => o.code === 'A')!;

describe('levelsForQuote', () => {
  it('keeps Option A on the catalogue line — SS 3 cannot drift back in', () => {
    const quoted = levelsForQuote(levels, { offerScope: offerA.scope });
    expect(quoted.map((l) => l.grade)).toEqual(GRADES.filter((g) => g !== 'SS 3'));
    expect(quoted.at(-1)?.grade).toBe('SS 2');
  });

  it('drops the secondary pathway when the school is primary only', () => {
    const quoted = levelsForQuote(levels, { stage: 'primary' });
    expect(quoted.every((l) => l.grade.startsWith('Basic'))).toBe(true);
    expect(quoted).toHaveLength(6);
  });

  it('drops the primary pathway when the school is secondary only', () => {
    const quoted = levelsForQuote(levels, { stage: 'secondary' });
    expect(quoted.some((l) => l.grade.startsWith('Basic'))).toBe(false);
    expect(quoted[0]?.grade).toBe('JSS 1');
  });

  it('lets stage and Option A narrow together, never restore a year', () => {
    const quoted = levelsForQuote(levels, {
      stage: 'secondary',
      offerScope: offerA.scope,
    });
    expect(quoted.map((l) => l.grade)).toEqual(['JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2']);
  });
});
