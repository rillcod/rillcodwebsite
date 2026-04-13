import { getSafeAutoProfileRole } from './role-utils';

describe('getSafeAutoProfileRole', () => {
  it('keeps allowed roles', () => {
    expect(getSafeAutoProfileRole('student')).toBe('student');
    expect(getSafeAutoProfileRole('parent')).toBe('parent');
    expect(getSafeAutoProfileRole('teacher')).toBe('teacher');
  });

  it('defaults unknown or privileged roles to student', () => {
    expect(getSafeAutoProfileRole('admin')).toBe('student');
    expect(getSafeAutoProfileRole('school')).toBe('student');
    expect(getSafeAutoProfileRole(undefined)).toBe('student');
    expect(getSafeAutoProfileRole(123)).toBe('student');
  });
});
