import { describe, expect, it } from 'vitest';
import { attendanceInReportTerm } from './term-evidence';

/**
 * Attendance rows key `student_id` to the legacy public.students row, while the
 * report works in portal_users ids. Preflight searched portal ids on BOTH
 * columns, matched nothing, and reported "Attendance coverage: 0" on the loading
 * screen — while the draft, which resolves legacy ids first, showed the true
 * figure. Two views of the same term disagreeing is worse than either being
 * wrong, because it makes staff distrust the one that is right.
 */
describe('attendance identity resolution', () => {
  it('matches a roll row keyed by the legacy students.id, not the portal id', () => {
    const portalId = '11111111-1111-1111-1111-111111111111';
    const legacyId = '22222222-2222-2222-2222-222222222222';

    // What the attendance table actually stores for a linked learner.
    const row = { user_id: null, student_id: legacyId, term_id: 'term-1', created_at: '2026-02-01T00:00:00Z' };

    const portalOnly = [portalId];
    const resolved = [portalId, legacyId];

    // The old preflight filter, reconstructed.
    const matches = (ids: string[]) => ids.includes(row.student_id) || ids.includes(String(row.user_id));

    expect(matches(portalOnly)).toBe(false); // the bug
    expect(matches(resolved)).toBe(true);    // after resolving legacy ids
  });

  it('keeps a row whose term_id matches the report term', () => {
    const range: any = { academicTermId: 'term-1', startDate: '2026-01-01', endDate: '2026-03-31' };
    expect(attendanceInReportTerm({ term_id: 'term-1', created_at: '2026-02-01T00:00:00Z' }, range)).toBe(true);
    expect(attendanceInReportTerm({ term_id: 'other', created_at: '2026-02-01T00:00:00Z' }, range)).toBe(false);
  });

  it('falls back to the date window when a roll row has no term_id', () => {
    // Rolls taken before terms were introduced carry no term_id at all.
    const range: any = { academicTermId: 'term-1', startDate: '2026-01-01', endDate: '2026-03-31' };
    expect(attendanceInReportTerm({ term_id: null, created_at: '2026-02-01T00:00:00Z' }, range)).toBe(true);
    expect(attendanceInReportTerm({ term_id: null, created_at: '2025-06-01T00:00:00Z' }, range)).toBe(false);
  });
});
