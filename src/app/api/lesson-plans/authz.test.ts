import { canAccessLessonScope } from './authz';

describe('lesson-plan authorization scope', () => {
  it("teacher A cannot patch teacher B's plan", () => {
    const allowed = canAccessLessonScope(
      { id: 'teacher-a', role: 'teacher', school_id: 'school-1' },
      { school_id: 'school-2', created_by: 'teacher-b' },
      ['school-1'],
    );
    expect(allowed).toBe(false);
  });

  it('school X cannot fetch school Y plan', () => {
    const allowed = canAccessLessonScope(
      { id: 'school-user', role: 'school', school_id: 'school-x' },
      { school_id: 'school-y', created_by: 'teacher-b' },
      [],
    );
    expect(allowed).toBe(false);
  });

  it('non-admin cannot read unscoped null-school plans', () => {
    const teacherAllowed = canAccessLessonScope(
      { id: 'teacher-a', role: 'teacher', school_id: 'school-1' },
      { school_id: null, created_by: 'teacher-a' },
      ['school-1'],
    );
    const schoolAllowed = canAccessLessonScope(
      { id: 'school-user', role: 'school', school_id: 'school-1' },
      { school_id: null, created_by: 'teacher-a' },
      [],
    );
    const adminAllowed = canAccessLessonScope(
      { id: 'admin-user', role: 'admin', school_id: null },
      { school_id: null, created_by: 'teacher-a' },
      [],
    );

    expect(teacherAllowed).toBe(false);
    expect(schoolAllowed).toBe(false);
    expect(adminAllowed).toBe(true);
  });
});

