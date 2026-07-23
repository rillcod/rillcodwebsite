import { describe, expect, it } from 'vitest';
import {
  normalizeCrmPhone,
  phoneLookupKeys,
  phonesMatch,
  shouldUpgradeBookRole,
} from '@/lib/crm/contact-book';

describe('normalizeCrmPhone', () => {
  it('canonicalizes Nigerian local 11-digit numbers', () => {
    expect(normalizeCrmPhone('08031234567')).toBe('2348031234567');
    expect(normalizeCrmPhone('+234 803 123 4567')).toBe('2348031234567');
  });

  it('canonicalizes 10-digit numbers without leading zero', () => {
    expect(normalizeCrmPhone('8031234567')).toBe('2348031234567');
  });

  it('returns null for empty input', () => {
    expect(normalizeCrmPhone('')).toBeNull();
    expect(normalizeCrmPhone(null)).toBeNull();
  });
});

describe('phonesMatch', () => {
  it('matches equivalent Nigerian formats', () => {
    expect(phonesMatch('08031234567', '+2348031234567')).toBe(true);
    expect(phonesMatch('8031234567', '2348031234567')).toBe(true);
  });

  it('rejects different numbers', () => {
    expect(phonesMatch('08031234567', '08021234567')).toBe(false);
  });
});

describe('phoneLookupKeys', () => {
  it('includes canonical and legacy keys', () => {
    const keys = phoneLookupKeys('+2348031234567');
    expect(keys).toContain('2348031234567');
    expect(keys).toContain('08031234567');
    expect(keys).toContain('8031234567');
  });
});

describe('shouldUpgradeBookRole', () => {
  it('allows upgrading external to parent', () => {
    expect(shouldUpgradeBookRole('external', 'parent')).toBe(true);
  });

  it('blocks demoting parent to external', () => {
    expect(shouldUpgradeBookRole('parent', 'external')).toBe(false);
  });

  it('blocks lateral external overwrite', () => {
    expect(shouldUpgradeBookRole('external', 'external')).toBe(false);
  });
});
