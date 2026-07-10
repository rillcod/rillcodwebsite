import { describe, expect, it } from 'vitest';
import { reportCoverageForStudents } from './coverage';

describe('reportCoverageForStudents', () => {
  it('scopes coverage to both term and academic period', async () => {
    const filters: Array<[string, unknown]> = [];
    const chain: any = {
      select: () => chain,
      in: () => chain,
      eq: (column: string, value: unknown) => { filters.push([column, value]); return chain; },
      then: (resolve: (value: unknown) => void) => resolve({ data: [{ student_id: 'student-1', is_published: true }] }),
    };
    const admin: any = { from: () => chain };
    const result = await reportCoverageForStudents(admin, ['student-1'], { termLabel: 'First Term', periodLabel: '2026/2027' });
    expect(filters).toContainEqual(['report_term', 'First Term']);
    expect(filters).toContainEqual(['report_period', '2026/2027']);
    expect(result.published.has('student-1')).toBe(true);
  });
});