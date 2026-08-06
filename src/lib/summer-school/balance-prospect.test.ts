import { describe, expect, it } from 'vitest';
import {
  isSameSpecialProgramRegistration,
  isSpecialProgramProspect,
} from '@/lib/summer-school/balance-prospect';

const PAGE = { id: '608bde08-e03f-46ea-bac6-1307932e2e00', title: 'AI Summer School 2026' };
const OTHER = '11111111-1111-1111-1111-111111111111';

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

describe('isSameSpecialProgramRegistration', () => {
  it('trusts the page tag over the title', () => {
    expect(isSameSpecialProgramRegistration(
      { course_interest: 'Something else entirely', notes: `[SpecialPage: ${PAGE.id}]` }, PAGE,
    )).toBe(true);
  });

  it('refuses a row tagged for a different programme, however similar the title', () => {
    // The old substring rule let the title override the tag, so a row could be
    // claimed by a programme it did not belong to.
    expect(isSameSpecialProgramRegistration(
      { course_interest: 'JSS2 AI Summer School 2026', notes: `[SpecialPage: ${OTHER}]` }, PAGE,
    )).toBe(false);
  });

  it('recognises the real untagged legacy rows', () => {
    // These six exist in production and were invisible to the duplicate guard:
    // "JSS3 Summer School 2026" does not contain "AI Summer School 2026".
    for (const interest of [
      'JSS3 Summer School 2026',
      'SS1 Summer School 2026',
      'JSS 2 AI Summer School 2026',
    ]) {
      expect(isSameSpecialProgramRegistration({ course_interest: interest, notes: null }, PAGE)).toBe(true);
    }
  });

  it('keeps cohort years apart', () => {
    expect(isSameSpecialProgramRegistration(
      { course_interest: 'JSS3 Summer School 2025', notes: null }, PAGE,
    )).toBe(false);
  });

  it('will not match a legacy row with no year when the page names one', () => {
    expect(isSameSpecialProgramRegistration(
      { course_interest: 'Summer School', notes: null }, PAGE,
    )).toBe(false);
  });

  it('rejects an unrelated programme', () => {
    expect(isSameSpecialProgramRegistration(
      { course_interest: 'Young Innovators (PRY · Ages 5–10)', notes: null }, PAGE,
    )).toBe(false);
  });

  it('falls back to the pre-page summer flow when there is no page', () => {
    expect(isSameSpecialProgramRegistration(
      { course_interest: 'JSS1 Summer School 2026', notes: null }, null,
    )).toBe(true);
    expect(isSameSpecialProgramRegistration(
      { course_interest: 'JSS1 Summer School 2026', notes: `[SpecialPage: ${OTHER}]` }, null,
    )).toBe(false);
  });
});
