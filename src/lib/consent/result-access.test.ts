import { describe, expect, it } from 'vitest';
import { consentFormMatchesEnrollment } from './result-access';

describe('consent result-access pathway matching', () => {
  it('keeps legacy forms on the Regular School pathway', () => {
    expect(consentFormMatchesEnrollment(null, 'school')).toBe(true);
    expect(consentFormMatchesEnrollment(undefined, null)).toBe(true);
  });

  it('does not present a Regular School form to an Online learner', () => {
    expect(consentFormMatchesEnrollment('school', 'online')).toBe(false);
  });

  it('keeps Special and In-person forms distinct', () => {
    expect(consentFormMatchesEnrollment('special', 'special')).toBe(true);
    expect(consentFormMatchesEnrollment('special', 'in_person')).toBe(false);
  });

  it('accepts legacy aliases through canonical normalization', () => {
    expect(consentFormMatchesEnrollment('summer_school', 'special')).toBe(true);
    expect(consentFormMatchesEnrollment('online_school', 'online')).toBe(true);
  });
});
