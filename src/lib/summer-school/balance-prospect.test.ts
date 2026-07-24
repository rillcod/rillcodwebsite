import { describe, expect, it } from 'vitest';
import { isSpecialProgramProspect } from '@/lib/summer-school/balance-prospect';

describe('balance prospect matching', () => {
  it('matches legacy summer course_interest', () => {
    expect(isSpecialProgramProspect({ course_interest: 'JSS1 Summer School 2026', notes: null })).toBe(true);
  });

  it('matches dynamic special programme via SpecialPage tag', () => {
    expect(
      isSpecialProgramProspect({
        course_interest: 'Young Innovators Batch B',
        notes: '[SpecialPage: 11111111-1111-1111-1111-111111111111]',
      }),
    ).toBe(true);
  });

  it('matches Programme tag without Summer School in title', () => {
    expect(
      isSpecialProgramProspect({
        course_interest: 'Grade 5 AI Explorer',
        notes: '[Programme: Holiday Coding Camp]',
      }),
    ).toBe(true);
  });

  it('rejects unrelated course interest', () => {
    expect(isSpecialProgramProspect({ course_interest: 'Term school registration', notes: null })).toBe(false);
  });
});
