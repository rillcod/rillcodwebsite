import { describe, expect, it } from 'vitest';
import { reportCoverageForStudents } from './coverage';

describe('reportCoverageForStudents', () => {
  it('matches on term_id OR report_term+period so legacy rows still count', async () => {
    const filters: Array<[string, unknown]> = [];
    let orFilter: string | null = null;
    const chain: any = {
      select: () => chain,
      in: () => chain,
      eq: (column: string, value: unknown) => { filters.push([column, value]); return chain; },
      or: (value: string) => { orFilter = value; return chain; },
      then: (resolve: (value: unknown) => void) => resolve({ data: [{ student_id: 'student-1', is_published: true }], error: null }),
    };
    const admin: any = { from: () => chain };
    const result = await reportCoverageForStudents(admin, ['student-1'], {
      termId: 'term-1',
      termLabel: 'First Term',
      periodLabel: '2026/2027',
    });
    expect(orFilter).toContain('term_id.eq.term-1');
    expect(orFilter).toContain('report_term.eq."First Term"');
    expect(orFilter).toContain('report_period.eq."2026/2027"');
    expect(filters).not.toContainEqual(['report_period', '2026/2027']);
    expect(result.published.has('student-1')).toBe(true);
  });

  it('falls back to label filters when term_id is absent', async () => {
    const filters: Array<[string, unknown]> = [];
    const chain: any = {
      select: () => chain,
      in: () => chain,
      eq: (column: string, value: unknown) => { filters.push([column, value]); return chain; },
      then: (resolve: (value: unknown) => void) => resolve({ data: [{ student_id: 'student-2', is_published: false }], error: null }),
    };
    const admin: any = { from: () => chain };
    const result = await reportCoverageForStudents(admin, ['student-2'], {
      termLabel: 'Third Term',
      periodLabel: '2025/2026',
    });
    expect(filters).toContainEqual(['report_term', 'Third Term']);
    expect(filters).toContainEqual(['report_period', '2025/2026']);
    expect(result.drafted.has('student-2')).toBe(true);
    expect(result.published.has('student-2')).toBe(false);
  });
});
