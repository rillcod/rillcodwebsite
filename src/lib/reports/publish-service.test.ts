import { describe, expect, it } from 'vitest';
import { publishProgressReport } from './publish-service';

const complete = { id: 'r1', student_id: 's1', student_name: 'Ada', section_class: 'JSS1', course_name: 'Coding', report_term: 'First Term', report_period: '2026/2027', school_section: 'school', report_date: '2026-10-01', instructor_name: 'Teacher', theory_score: 70, practical_score: 70, attendance_score: 70, participation_score: 70, overall_score: 70, overall_grade: 'B2', key_strengths: 'Strong', areas_for_growth: 'Practice', engagement_metrics: { classwork_score: 70, assessment_score: 70 }, is_published: false, verification_code: 'RPT-EXISTING' };

function mockAdmin(report: any) {
  const writes: any[] = [];
  const selectChain: any = { eq: () => selectChain, maybeSingle: async () => ({ data: report, error: null }) };
  const updateChain: any = { eq: () => updateChain, select: () => updateChain, single: async () => ({ data: { ...report, ...writes[0] }, error: null }) };
  return { writes, admin: { from: () => ({ select: () => selectChain, update: (payload: any) => { writes.push(payload); return updateChain; } }) } };
}

describe('publishProgressReport', () => {
  it('rejects an incomplete report without writing', async () => { const mock = mockAdmin({ ...complete, key_strengths: '' }); const result = await publishProgressReport(mock.admin, 'r1'); expect(result.ok).toBe(false); expect(mock.writes).toHaveLength(0); });
  it('publishes a valid report through one guarded update', async () => { const mock = mockAdmin(complete); const result = await publishProgressReport(mock.admin, 'r1'); expect(result.ok).toBe(true); expect(mock.writes).toHaveLength(1); expect(mock.writes[0]).toMatchObject({ is_published: true, verification_code: 'RPT-EXISTING' }); });
});