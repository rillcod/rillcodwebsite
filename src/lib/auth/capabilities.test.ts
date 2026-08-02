import { describe, expect, it } from 'vitest';
import { denyIfMissingCapability, roleHasCapability, rolesFor } from './capabilities';

/**
 * The gap this closes: the dashboard hid grading from partner-school accounts
 * (`canGrade = admin || teacher`), but three API routes guarded with
 * `['admin','teacher','school']` — so a school login was blocked in the UI and
 * allowed by a direct API call. Same question, two answers.
 */
describe('capabilities', () => {
  it('a partner school cannot grade', () => {
    expect(roleHasCapability('school', 'grade')).toBe(false);
  });

  it('rillcod staff can grade', () => {
    expect(roleHasCapability('admin', 'grade')).toBe(true);
    expect(roleHasCapability('teacher', 'grade')).toBe(true);
  });

  it('families can never grade', () => {
    expect(roleHasCapability('parent', 'grade')).toBe(false);
    expect(roleHasCapability('student', 'grade')).toBe(false);
  });

  it('a partner school CAN still read reports — this is a write restriction only', () => {
    expect(roleHasCapability('school', 'view_reports')).toBe(true);
  });

  it('school is excluded from every authoring capability', () => {
    for (const cap of ['grade', 'publish_reports', 'upload_library'] as const) {
      expect(rolesFor(cap)).not.toContain('school');
    }
  });

  it('unknown, empty and missing roles are denied', () => {
    expect(roleHasCapability(null, 'grade')).toBe(false);
    expect(roleHasCapability(undefined, 'grade')).toBe(false);
    expect(roleHasCapability('', 'grade')).toBe(false);
    expect(roleHasCapability('superuser', 'grade')).toBe(false);
  });

  it('keeps accountability and platform user management admin-only', () => {
    for (const capability of ['view_accountability', 'manage_users'] as const) {
      expect(rolesFor(capability)).toEqual(['admin']);
    }
  });

  it('separates scoped records from credential disclosure', () => {
    expect(roleHasCapability('teacher', 'view_records')).toBe(true);
    expect(roleHasCapability('teacher', 'view_registration_credentials')).toBe(false);
    expect(roleHasCapability('school', 'view_registration_credentials')).toBe(true);
  });

  it('centralizes account creation and scoped password recovery policy', () => {
    expect(rolesFor('create_accounts')).toEqual(['admin', 'school']);
    expect(rolesFor('reset_scoped_passwords')).toEqual(['admin', 'teacher', 'school']);
    expect(roleHasCapability('student', 'reset_scoped_passwords')).toBe(false);
  });

  it('denial is a 403 that does not leak the permission model', () => {
    const denied = denyIfMissingCapability('school', 'grade');
    expect(denied).not.toBeNull();
    expect(denied?.status).toBe(403);
    expect(denied?.error).not.toMatch(/school|teacher|admin|role/i);
  });

  it('an allowed role produces no denial', () => {
    expect(denyIfMissingCapability('teacher', 'grade')).toBeNull();
  });
});
