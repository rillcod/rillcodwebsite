import { describe, expect, it } from 'vitest';
import { getProtectedAcademicEvidence } from './protected-academic-evidence';

function query(result: Record<string, unknown>) {
  const chain: any = {
    select: () => chain,
    or: () => chain,
    not: () => chain,
    eq: () => chain,
    in: () => chain,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

describe('protected academic evidence checks', () => {
  it('counts every protected score source', async () => {
    const results: Record<string, Record<string, unknown>> = {
      assignment_submissions: { count: 2, data: null, error: null },
      cbt_sessions: { count: 1, data: null, error: null },
      student_progress_reports: { count: 3, data: null, error: null },
      enrollments: { count: null, data: [], error: null },
    };
    const evidence = await getProtectedAcademicEvidence({
      from: (table: string) => query(results[table]),
    }, 'learner-1');

    expect(evidence).toMatchObject({
      assignmentScores: 2,
      cbtScores: 1,
      progressReports: 3,
      moderatedTermGrades: 0,
      total: 6,
    });
  });

  it('fails closed when an evidence source cannot be checked', async () => {
    const results: Record<string, Record<string, unknown>> = {
      assignment_submissions: { count: null, data: null, error: { message: 'database unavailable' } },
      cbt_sessions: { count: 0, data: null, error: null },
      student_progress_reports: { count: 0, data: null, error: null },
      enrollments: { count: null, data: [], error: null },
    };

    await expect(getProtectedAcademicEvidence({
      from: (table: string) => query(results[table]),
    }, 'learner-1')).rejects.toThrow('Could not verify protected academic evidence');
  });
});

