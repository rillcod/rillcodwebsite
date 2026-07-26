import { describe, expect, it } from 'vitest';
import { canAccessSchoolSync } from './school-scope';

/**
 * Four copies of this rule used to exist (bulk-register, resolve-for-bulk-register,
 * cards/rbac, auth-utils) and they did not agree on the unscoped case, so the same
 * record could be readable through one route and Forbidden through another. These
 * tests pin the single agreed definition.
 */
describe('canAccessSchoolSync', () => {
  it('always allows admins, including for unscoped records', () => {
    expect(canAccessSchoolSync({ role: 'admin' }, new Set<string>(), 'school-1')).toBe(true);
    expect(canAccessSchoolSync({ role: 'admin' }, [], null)).toBe(true);
  });

  it('allows non-admins only for schools they are assigned to', () => {
    const assigned = new Set(['school-1', 'school-2']);
    expect(canAccessSchoolSync({ role: 'teacher' }, assigned, 'school-2')).toBe(true);
    expect(canAccessSchoolSync({ role: 'teacher' }, assigned, 'school-9')).toBe(false);
  });

  it('denies unscoped (null school_id) records for non-admins', () => {
    // The deleted auth-utils copy returned TRUE here, which quietly exposed
    // school-less rows to every teacher.
    expect(canAccessSchoolSync({ role: 'teacher' }, new Set(['school-1']), null)).toBe(false);
    expect(canAccessSchoolSync({ role: 'school' }, ['school-1'], undefined)).toBe(false);
  });

  it('accepts either a Set or an array of allowed IDs', () => {
    expect(canAccessSchoolSync({ role: 'school' }, ['school-1'], 'school-1')).toBe(true);
    expect(canAccessSchoolSync({ role: 'school' }, new Set(['school-1']), 'school-1')).toBe(true);
  });

  it('denies a caller with no role and no assignments', () => {
    expect(canAccessSchoolSync({}, [], 'school-1')).toBe(false);
  });
});
