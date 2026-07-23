import { describe, expect, it } from 'vitest';
import { mapPortalStudentsToRosterInput, mapRecordsToRosterInput } from './map-to-roster-input';

describe('mapRecordsToRosterInput', () => {
  it('normalises card studio records for roster export', () => {
    const mapped = mapRecordsToRosterInput([
      {
        id: 'u1',
        name: '  Ada Okoro ',
        gradeLevel: ' Basic 4 ',
        sectionClass: ' Section A ',
        roleLabel: 'Student',
      },
    ]);
    expect(mapped).toEqual([{
      id: 'u1',
      name: 'Ada Okoro',
      gradeLevel: 'Basic 4',
      sectionClass: 'Section A',
      roleLabel: 'Student',
    }]);
  });
});

describe('mapPortalStudentsToRosterInput', () => {
  it('falls back to class name when section_class is empty', () => {
    const classNameById = new Map([['c1', 'Python JSS 1']]);
    const classIdByStudent = new Map([['u1', 'c1']]);
    const mapped = mapPortalStudentsToRosterInput(
      [{ id: 'u1', full_name: 'Ben', grade: 'JSS 1', section_class: null }],
      classNameById,
      classIdByStudent,
    );
    expect(mapped[0].sectionClass).toBe('Python JSS 1');
  });
});

describe('mapRecordsToRosterInput classId fallback', () => {
  it('resolves section from classId when sectionClass is empty', () => {
    const classNameById = new Map([['c1', 'Basic 4 A']]);
    const mapped = mapRecordsToRosterInput([{
      id: 'u1',
      name: 'Ada',
      gradeLevel: 'Basic 4',
      sectionClass: '',
      classId: 'c1',
      roleLabel: 'Student',
    }], classNameById);
    expect(mapped[0].sectionClass).toBe('Basic 4 A');
  });
});
