import { describe, expect, it } from 'vitest';
import { findCanonicalProgressReport } from './canonical-report';

function fakeAdmin(rows: Record<string, unknown>[]) {
  return {
    from() {
      const filters: Array<{ op: string; col: string; val: string }> = [];
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (col: string, val: string) => {
        filters.push({ op: 'eq', col, val: String(val) });
        return chain;
      };
      chain.ilike = (col: string, val: string) => {
        filters.push({ op: 'ilike', col, val: String(val) });
        return chain;
      };
      chain.order = () => chain;
      chain.limit = () => chain;
      chain.maybeSingle = async () => {
        const data = rows.find((row) => filters.every(({ op, col, val }) => {
          const actual = String(row[col] ?? '');
          return op === 'ilike' ? actual.toLowerCase() === val.toLowerCase() : actual === val;
        })) ?? null;
        return { data };
      };
      return chain;
    },
  };
}

const builderRow = {
  id: 'spr-1',
  student_id: 'stu-1',
  course_id: 'course-1',
  course_name: 'Scratch',
  report_term: 'First Term',
  report_period: '2025/2026',
  calculation_mode: 'manual',
  is_published: false,
};

describe('findCanonicalProgressReport', () => {
  it('returns null without a student', async () => {
    expect(await findCanonicalProgressReport(fakeAdmin([builderRow]) as any, { studentId: '' })).toBeNull();
  });

  it('reuses the Write report cards row by student, course, term and year', async () => {
    const found = await findCanonicalProgressReport(fakeAdmin([builderRow]) as any, {
      studentId: 'stu-1',
      courseId: 'course-1',
      courseName: 'Scratch',
      reportTerm: 'First Term',
      reportPeriod: '2025/2026',
    });
    expect(found?.id).toBe('spr-1');
  });

  it('reuses a name-matched row when the prepare desk only has offering ids', async () => {
    const unnamed = { ...builderRow, course_id: null };
    const found = await findCanonicalProgressReport(fakeAdmin([unnamed]) as any, {
      studentId: 'stu-1',
      courseId: 'course-1',
      courseName: 'Scratch',
      reportTerm: 'First Term',
      reportPeriod: '2025/2026',
      academicOfferingId: 'off-1',
      offeringPeriodId: 'per-1',
    });
    expect(found?.id).toBe('spr-1');
  });

  it('falls back to offering identity when term labels differ', async () => {
    const offeringRow = {
      ...builderRow,
      report_term: 'Term 1',
      academic_offering_id: 'off-1',
      offering_period_id: 'per-1',
    };
    const found = await findCanonicalProgressReport(fakeAdmin([offeringRow]) as any, {
      studentId: 'stu-1',
      courseId: 'course-1',
      courseName: 'Scratch',
      reportTerm: 'First Term',
      reportPeriod: '2025/2026',
      academicOfferingId: 'off-1',
      offeringPeriodId: 'per-1',
    });
    expect(found?.id).toBe('spr-1');
  });
});
