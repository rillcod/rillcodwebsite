import { describe, expect, it } from 'vitest';
import { buildSchoolRosterPdfRows } from './build-school-roster-pdf-rows';

const STUDENT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('buildSchoolRosterPdfRows', () => {
  it('maps school roster load data into printable rows', () => {
    const classNameById = new Map([['c1', 'JSS 1 Python']]);
    const rows = buildSchoolRosterPdfRows({
      studentRows: [{
        id: STUDENT_ID,
        full_name: 'Ada',
        class_id: 'c1',
        section_class: null,
        grade: 'JSS 1',
        class_arm: null,
      }],
      classNameById,
    }, 'https://rillcod.com');
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Ada');
    expect(rows[0].section).toBe('JSS 1 Python');
    expect(rows[0].rcNumber).toHaveLength(8);
  });
});
