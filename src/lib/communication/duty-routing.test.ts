import { describe, expect, it } from 'vitest';
import { chooseDutyAssignee, rankDutyCandidates, type DutyCandidate } from './duty-routing';

const now = '2026-07-20T10:00:00.000Z';

function candidate(overrides: Partial<DutyCandidate> & Pick<DutyCandidate, 'id' | 'fullName'>): DutyCandidate {
  const { id, fullName, ...rest } = overrides;
  return {
    id,
    fullName,
    role: 'teacher',
    schoolId: null,
    isActive: true,
    acceptsGeneralQueue: true,
    isAvailable: true,
    maxActiveCases: 8,
    activeCases: 0,
    skillTags: [],
    isPrimaryDuty: false,
    isBackupDuty: false,
    ...rest,
  };
}

describe('database-sized duty routing', () => {
  it('uses every active eligible teacher supplied by the database, without a fixed staff count', () => {
    const pool = Array.from({ length: 11 }, (_, index) => candidate({
      id: `teacher-${index}`,
      fullName: `Teacher ${index}`,
      activeCases: index === 7 ? 0 : index + 1,
      isPrimaryDuty: index === 7,
    }));

    const ranked = rankDutyCandidates(pool, { now });
    expect(ranked).toHaveLength(11);
    expect(ranked[0].id).toBe('teacher-7');
  });

  it('prefers the class owner for class-specific work', () => {
    const selected = chooseDutyAssignee([
      candidate({ id: 'duty', fullName: 'Duty Teacher', isPrimaryDuty: true }),
      candidate({ id: 'owner', fullName: 'Class Teacher', activeCases: 3 }),
    ], { now, classOwnerId: 'owner' });

    expect(selected?.id).toBe('owner');
    expect(selected?.reasons).toContain('owns the customer class');
  });

  it('protects the administrator from routine work but selects admin for restricted work', () => {
    const pool = [
      candidate({ id: 'admin', fullName: 'Main Admin', role: 'admin', isPrimaryDuty: true }),
      candidate({ id: 'teacher', fullName: 'Duty Teacher', isPrimaryDuty: true }),
    ];

    expect(chooseDutyAssignee(pool, { now })?.id).toBe('teacher');
    expect(chooseDutyAssignee(pool, { now, restrictedToAdmin: true })?.id).toBe('admin');
  });

  it('excludes inactive, deleted, unavailable, and out-of-school teachers', () => {
    const pool = [
      candidate({ id: 'inactive', fullName: 'Inactive', isActive: false }),
      candidate({ id: 'deleted', fullName: 'Deleted', isDeleted: true }),
      candidate({ id: 'away', fullName: 'Away', unavailableUntil: '2026-07-21T10:00:00.000Z' }),
      candidate({ id: 'wrong-school', fullName: 'Wrong School', schoolId: 'school-b' }),
      candidate({ id: 'eligible', fullName: 'Eligible', schoolId: 'school-a' }),
    ];

    const ranked = rankDutyCandidates(pool, { now, targetSchoolId: 'school-a' });
    expect(ranked.map((row) => row.id)).toEqual(['eligible']);
  });

  it('uses workload and upcoming teaching to choose the least disruptive operator', () => {
    const selected = chooseDutyAssignee([
      candidate({ id: 'busy', fullName: 'Busy', isPrimaryDuty: true, activeCases: 7, teachesWithinMinutes: 30 }),
      candidate({ id: 'backup', fullName: 'Backup', isBackupDuty: true, activeCases: 0 }),
    ], { now });

    expect(selected?.id).toBe('backup');
  });

  it('supports a dual-role teacher as the single authority for restricted work', () => {
    const dualRole = candidate({
      id: 'dual-role',
      fullName: 'Dual-role teacher',
      canHandleAdmin: true,
      isPrimaryDuty: true,
    });
    const teacher = candidate({ id: 'teacher', fullName: 'Teacher', activeCases: 2 });

    expect(chooseDutyAssignee([dualRole, teacher], { now })?.id).toBe('dual-role');
    expect(chooseDutyAssignee([dualRole, teacher], { now, restrictedToAdmin: true })?.id).toBe('dual-role');
  });
});
