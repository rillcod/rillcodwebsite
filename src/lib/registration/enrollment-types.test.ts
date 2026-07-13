import { describe, expect, it } from 'vitest';
import {
  normalizeEnrollmentType,
  isSpecialEnrollment,
  isSpecialProgramPaymentType,
  isSpecialProgramBalancePaymentType,
  SPECIAL_PAYMENT_TYPE,
} from './enrollment-types';

describe('normalizeEnrollmentType', () => {
  it.each([
    ['school', 'school'],
    ['online', 'online'],
    ['online_school', 'online'],
    ['in_person', 'in_person'],
    ['special', 'special'],
    ['summer_school', 'special'],
    ['bootcamp', 'special'],
    ['SUMMER_SCHOOL', 'special'],
  ] as const)('maps %s → %s', (input, expected) => {
    expect(normalizeEnrollmentType(input)).toBe(expected);
  });
});

describe('isSpecialEnrollment', () => {
  it('treats legacy summer/bootcamp as special', () => {
    expect(isSpecialEnrollment('summer_school')).toBe(true);
    expect(isSpecialEnrollment('bootcamp')).toBe(true);
    expect(isSpecialEnrollment('special')).toBe(true);
    expect(isSpecialEnrollment('online')).toBe(false);
  });
});

describe('special payment types', () => {
  it('accepts new and legacy gateway types', () => {
    expect(isSpecialProgramPaymentType(SPECIAL_PAYMENT_TYPE)).toBe(true);
    expect(isSpecialProgramPaymentType('summer_school')).toBe(true);
    expect(isSpecialProgramBalancePaymentType('summer_school_balance')).toBe(true);
    expect(isSpecialProgramPaymentType('registration')).toBe(false);
  });
});
