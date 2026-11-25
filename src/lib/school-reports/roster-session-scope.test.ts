import { describe, expect, it } from 'vitest';
import { getSessionBoundary } from '@/lib/academic/session-scope';
import { loadSchoolReportRoster } from './loaders/roster';

function createPaginatedMockAdmin(tables: Record<string, any[]>) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        or: () => chain,
        in: () => chain,
        range: async (from: number, to: number) => ({
          data: rows.slice(from, to + 1),
          error: null,
        }),
      };
      return chain;
    },
  } as any;
}

describe('loadSchoolReportRoster session-scope filtering', () => {
  const boundary = getSessionBoundary();

  it('excludes withdrawn learners and unconfirmed carryover learners for the live session', async () => {
    const admin = createPaginatedMockAdmin({
      portal_users: [
        {
          id: 'stu-confirmed',
          full_name: 'Ada Lovelace',
          class_id: 'cls-1',
          section_class: 'JSS1',
          grade: 'JSS1',
          class_arm: 'A',
          is_active: true,
          created_at: boundary.sessionStartIso,
          metadata: { confirmed_session: boundary.periodLabel },
        },
        {
          id: 'stu-carryover',
          full_name: 'Prior Term Learner',
          class_id: 'cls-1',
          section_class: 'JSS1',
          grade: 'JSS1',
          class_arm: 'A',
          is_active: true,
          created_at: '2025-05-10T00:00:00.000Z',
          metadata: {},
        },
        {
          id: 'stu-withdrawn',
          full_name: 'Withdrawn Learner',
          class_id: 'cls-1',
          section_class: 'JSS1',
          grade: 'JSS1',
          class_arm: 'A',
          is_active: true,
          created_at: boundary.sessionStartIso,
          metadata: { confirmed_session: boundary.periodLabel },
        },
      ],
      classes: [{ id: 'cls-1', name: 'JSS1 Coding', teacher_id: 'tch-1' }],
      class_term_rosters: [
        {
          student_id: 'stu-withdrawn',
          class_id: 'cls-1',
          status: 'withdrawn',
          started_at: boundary.sessionStartIso,
          ended_at: new Date(boundary.sessionStartMs + 86_400_000).toISOString(),
        },
      ],
    });

    const currentResult = await loadSchoolReportRoster(
      admin,
      'school-1',
      new Date().toISOString(),
      { academicYear: boundary.periodLabel },
    );
    expect(currentResult.studentIds).toEqual(['stu-confirmed']);
    expect(currentResult.data.studentRows).toHaveLength(1);

    const priorSessionResult = await loadSchoolReportRoster(
      admin,
      'school-1',
      new Date().toISOString(),
      { academicYear: '2024/2025' },
    );
    expect(priorSessionResult.studentIds).toEqual(['stu-confirmed', 'stu-carryover']);
  });
});
