import { describe, expect, it } from 'vitest';
import { canActivatePortalUser, portalStructureError } from './structure';

describe('portal structure rules', () => {
  it('allows admins without school/class', () => {
    expect(portalStructureError('admin', {})).toBeNull();
    expect(canActivatePortalUser('admin', {})).toBe(true);
  });

  it('requires school+class for students', () => {
    expect(portalStructureError('student', { schoolId: 's1' })).toMatch(/class/i);
    expect(portalStructureError('student', { classId: 'c1' })).toMatch(/school/i);
    expect(portalStructureError('student', { schoolId: 's1', classId: 'c1' })).toBeNull();
  });

  it('requires school only for parents (no class)', () => {
    expect(portalStructureError('parent', {})).toMatch(/school/i);
    expect(portalStructureError('parent', { schoolId: 's1' })).toBeNull();
    expect(canActivatePortalUser('parent', { schoolId: 's1' })).toBe(true);
  });

  it('requires school for teachers and school managers', () => {
    expect(portalStructureError('teacher', { schoolId: null })).toMatch(/school/i);
    expect(portalStructureError('school', { schoolId: 's1' })).toBeNull();
  });

  it('rejects unknown roles (no structure bypass)', () => {
    expect(portalStructureError('superuser', {})).toMatch(/Unknown portal role/i);
    expect(canActivatePortalUser('external', { schoolId: 's1' })).toBe(false);
  });
});
