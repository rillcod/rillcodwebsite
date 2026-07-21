import { describe, expect, it } from 'vitest';
import { canManageSchoolReport, canViewSchoolReport } from './access';

type Actor = {
  profile: { role: string; school_id?: string | null };
  schoolIds: string[];
};

function actor(role: string, schoolIds: string[] = [], schoolId: string | null = null): Actor {
  return { profile: { role, school_id: schoolId }, schoolIds };
}

describe('school report access', () => {
  const schoolA = 'school-a';
  const schoolB = 'school-b';

  it('allows admin to manage any school', () => {
    const admin = actor('admin', [schoolA, schoolB]);
    expect(canManageSchoolReport(admin as any, schoolA)).toBe(true);
    expect(canManageSchoolReport(admin as any, schoolB)).toBe(true);
  });

  it('allows assigned teachers only for their schools', () => {
    const teacher = actor('teacher', [schoolA]);
    expect(canManageSchoolReport(teacher as any, schoolA)).toBe(true);
    expect(canManageSchoolReport(teacher as any, schoolB)).toBe(false);
  });

  it('allows school accounts to view published reports for their school only', () => {
    const school = actor('school', [schoolA], schoolA);
    expect(canViewSchoolReport(school as any, { school_id: schoolA, status: 'published' })).toBe(true);
    expect(canViewSchoolReport(school as any, { school_id: schoolB, status: 'published' })).toBe(false);
    expect(canViewSchoolReport(school as any, { school_id: schoolA, status: 'draft' })).toBe(false);
  });

  it('allows staff to view drafts for managed schools', () => {
    const teacher = actor('teacher', [schoolA]);
    expect(canViewSchoolReport(teacher as any, { school_id: schoolA, status: 'draft' })).toBe(true);
    expect(canViewSchoolReport(teacher as any, { school_id: schoolB, status: 'draft' })).toBe(false);
  });
});
