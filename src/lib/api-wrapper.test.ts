import { describe, it, expect } from 'vitest';
import { isRoleAllowed } from './api-wrapper';

describe('isRoleAllowed', () => {
  it('allows when no role restriction exists', () => {
    expect(isRoleAllowed(undefined, null)).toBe(true);
    expect(isRoleAllowed([], null)).toBe(true);
  });

  it('denies when role is missing for restricted routes', () => {
    expect(isRoleAllowed(['admin', 'teacher'], null)).toBe(false);
  });

  it('allows matching role and denies non-matching role', () => {
    expect(isRoleAllowed(['admin', 'teacher'], 'teacher')).toBe(true);
    expect(isRoleAllowed(['admin', 'teacher'], 'student')).toBe(false);
  });
});
