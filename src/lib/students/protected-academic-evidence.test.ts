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
      students: { data: [{ id: 'student-row-1' }], error: null },
      assignment_submissions: {
        data: [
          { id: 'submission-1', grade: 80 },
          { id: 'submission-2', grade: null, weighted_score: 12 },
          { id: 'submission-ungraded', grade: null, status: 'submitted' },
        ],
        error: null,
      },
      cbt_sessions: { data: [{ id: 'attempt-1', score: null, manual_scores: null }], error: null },
      student_progress_reports: {
        data: [
          { id: 'report-1', is_published: true },
          { id: 'report-2', overall_score: 0 },
          { id: 'report-3', theory_score: 42 },
          { id: 'report-draft', is_published: false },
        ],
        error: null,
      },
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
      students: { data: [{ id: 'student-row-1' }], error: null },
      assignment_submissions: { data: null, error: { message: 'database unavailable' } },
      cbt_sessions: { data: [], error: null },
      student_progress_reports: { data: [], error: null },
      enrollments: { count: null, data: [], error: null },
    };

    await expect(getProtectedAcademicEvidence({
      from: (table: string) => query(results[table]),
    }, 'learner-1')).rejects.toThrow('Could not verify protected academic evidence');
  });

  it('protects manual and weighted marks linked through the students table id', async () => {
    const orCalls: string[] = [];
    const results: Record<string, Record<string, unknown>> = {
      students: { data: [{ id: 'student-row-1' }], error: null },
      assignment_submissions: {
        data: [{ id: 'submission-1', grading_mode: 'manual', grade: null }],
        error: null,
      },
      cbt_sessions: { data: [], error: null },
      student_progress_reports: { data: [], error: null },
      enrollments: { data: [], error: null },
    };
    const evidence = await getProtectedAcademicEvidence({
      from: (table: string) => {
        const chain = query(results[table]);
        chain.or = (value: string) => { orCalls.push(value); return chain; };
        return chain;
      },
    }, 'learner-1');

    expect(evidence.assignmentScores).toBe(1);
    expect(orCalls).toContain('portal_user_id.eq.learner-1,user_id.eq.learner-1,student_id.eq.student-row-1');
  });
});
