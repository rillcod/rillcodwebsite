import { describe, expect, it } from 'vitest';
import {
  ImpermissibleSplitError,
  MAX_SCHOOL_SHARE_PERCENT,
  MIN_RILLCOD_SHARE_PERCENT,
  OFFERABLE_SCHOOL_SHARES,
  STANDARD_RILLCOD_SHARE_PERCENT,
  STANDARD_SCHOOL_SHARE_PERCENT,
  isPermittedRillcodShare,
  isPermittedSchoolShare,
  normaliseSchoolSharePercent,
} from './split';

/**
 * The rule these guard is the one the database already enforces on agreed terms:
 *
 *   partnership_terms_rillcod_not_minority
 *     CHECK (rillcod_share_percent IS NULL OR rillcod_share_percent >= 50)
 *
 * A proposal states the split on a document a school then holds us to and stores
 * nothing, so it is the one place a wrong figure has no backstop at all.
 */

describe('the split rule', () => {
  it('matches the floor the database enforces', () => {
    expect(MIN_RILLCOD_SHARE_PERCENT).toBe(50);
    expect(MAX_SCHOOL_SHARE_PERCENT).toBe(50);
  });

  it('permits an equal split but never a Rillcod minority', () => {
    expect(isPermittedRillcodShare(50)).toBe(true);
    expect(isPermittedRillcodShare(70)).toBe(true);
    expect(isPermittedRillcodShare(100)).toBe(true);
    expect(isPermittedRillcodShare(49)).toBe(false);
    expect(isPermittedRillcodShare(30)).toBe(false);
  });

  it('sees the same rule from the school side', () => {
    expect(isPermittedSchoolShare(50)).toBe(true);
    expect(isPermittedSchoolShare(30)).toBe(true);
    expect(isPermittedSchoolShare(0)).toBe(true);
    expect(isPermittedSchoolShare(51)).toBe(false);
    expect(isPermittedSchoolShare(90)).toBe(false);
  });

  it('keeps the standard deal at 70/30', () => {
    expect(STANDARD_RILLCOD_SHARE_PERCENT).toBe(70);
    expect(STANDARD_SCHOOL_SHARE_PERCENT).toBe(30);
    expect(STANDARD_RILLCOD_SHARE_PERCENT + STANDARD_SCHOOL_SHARE_PERCENT).toBe(100);
  });
});

describe('what the desk may offer', () => {
  it('offers nothing the rule forbids', () => {
    // A hardcoded list eventually gains an option the rule refuses; this one is
    // derived, and this is the assertion that keeps it that way.
    for (const option of OFFERABLE_SCHOOL_SHARES) {
      expect(isPermittedSchoolShare(option.school)).toBe(true);
      expect(isPermittedRillcodShare(option.rillcod)).toBe(true);
      expect(option.school + option.rillcod).toBe(100);
    }
  });

  it('includes the standard and the equal split', () => {
    const shares = OFFERABLE_SCHOOL_SHARES.map((o) => o.school);
    expect(shares).toContain(STANDARD_SCHOOL_SHARE_PERCENT);
    expect(shares).toContain(MAX_SCHOOL_SHARE_PERCENT);
  });
});

describe('a share arriving from a request', () => {
  it('accepts what the picker offers', () => {
    for (const option of OFFERABLE_SCHOOL_SHARES) {
      expect(normaliseSchoolSharePercent(String(option.school))).toBe(option.school);
    }
  });

  it('treats absence as "no proposal", not as zero', () => {
    expect(normaliseSchoolSharePercent(null)).toBeNull();
    expect(normaliseSchoolSharePercent(undefined)).toBeNull();
    expect(normaliseSchoolSharePercent('')).toBeNull();
    expect(normaliseSchoolSharePercent('not a number')).toBeNull();
  });

  it('refuses a split that would invert the partnership', () => {
    // The failure this exists for: the picker offers 20–50, and the API used to
    // take whatever arrived — so a crafted request could print "Your 90% share"
    // on a document a school then holds us to.
    expect(() => normaliseSchoolSharePercent(90)).toThrow(ImpermissibleSplitError);
    expect(() => normaliseSchoolSharePercent(51)).toThrow(ImpermissibleSplitError);
    expect(() => normaliseSchoolSharePercent(-1)).toThrow(ImpermissibleSplitError);
  });

  it('refuses rather than clamps, and says why', () => {
    // Silently turning 90 into 50 would issue a document nobody asked for, and
    // the person who asked would never know it had been changed.
    try {
      normaliseSchoolSharePercent(90);
      throw new Error('should have refused');
    } catch (error) {
      expect(error).toBeInstanceOf(ImpermissibleSplitError);
      expect((error as Error).message).toContain('90%');
      expect((error as Error).message).toContain('minority');
    }
  });
});
