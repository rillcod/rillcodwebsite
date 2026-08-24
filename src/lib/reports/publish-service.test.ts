import { describe, expect, it } from 'vitest';
import { publishProgressReport } from './publish-service';

const complete = { id: 'r1', student_id: 's1', student_name: 'Ada', section_class: 'JSS1', course_name: 'Coding', report_term: 'First Term', report_period: '2026/2027', school_section: 'school', report_date: '2026-10-01', instructor_name: 'Teacher', theory_score: 70, practical_score: 70, attendance_score: 70, participation_score: 70, overall_score: 70, overall_grade: 'B2', key_strengths: 'Strong', areas_for_growth: 'Practice', engagement_metrics: { classwork_score: 70, assessment_score: 70 }, is_published: false, verification_code: 'RPT-EXISTING', updated_at: '2026-10-01T08:00:00.000Z' };

function mockAdmin(report: any) {
  const writes: any[] = [];
  const selectChain: any = { eq: () => selectChain, maybeSingle: async () => ({ data: report, error: null }) };
  const updateChain: any = { eq: () => updateChain, is: () => updateChain, or: () => updateChain, select: () => updateChain, maybeSingle: async () => ({ data: { ...report, ...writes[0] }, error: null }) };
  return { writes, admin: { from: () => ({ select: () => selectChain, update: (payload: any) => { writes.push(payload); return updateChain; } }) } };
}

describe('publishProgressReport', () => {
  it('rejects an incomplete report without writing', async () => { const mock = mockAdmin({ ...complete, key_strengths: '' }); const result = await publishProgressReport(mock.admin, 'r1'); expect(result.ok).toBe(false); expect(mock.writes).toHaveLength(0); });
  it('publishes a valid report through one guarded update', async () => { const mock = mockAdmin(complete); const result = await publishProgressReport(mock.admin, 'r1'); expect(result.ok).toBe(true); if (!result.ok) throw new Error('Expected publish success'); expect(result.newlyPublished).toBe(true); expect(mock.writes).toHaveLength(1); expect(mock.writes[0]).toMatchObject({ is_published: true, verification_code: 'RPT-EXISTING' }); expect(mock.writes[0].published_at).toEqual(expect.any(String)); });

  it('does not claim a second delivery transition for an already-published report', async () => {
    const mock = mockAdmin({ ...complete, is_published: true, published_at: '2026-10-02T00:00:00.000Z' });
    const result = await publishProgressReport(mock.admin, 'r1');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected publish success');
    expect(result.newlyPublished).toBe(false);
    expect(mock.writes).toHaveLength(0);
  });

  it('refuses to publish a browser version that is already stale', async () => {
    const mock = mockAdmin(complete);
    const result = await publishProgressReport(mock.admin, 'r1', {}, { expectedUpdatedAt: '2026-09-30T08:00:00.000Z' });
    expect(result).toMatchObject({ ok: false, status: 409, code: 'STALE_REPORT_DRAFT' });
    expect(mock.writes).toHaveLength(0);
  });

  it('returns the live report without a second delivery when another publisher wins the transition', async () => {
    let loadCount = 0;
    const updateChain: any = {
      eq: () => updateChain,
      is: () => updateChain,
      or: () => updateChain,
      select: () => updateChain,
      maybeSingle: async () => ({ data: null, error: null }),
    };
    const selectChain: any = {
      eq: () => selectChain,
      maybeSingle: async () => {
        loadCount += 1;
        return { data: loadCount === 1 ? complete : { ...complete, is_published: true }, error: null };
      },
    };
    const admin = { from: () => ({ select: () => selectChain, update: () => updateChain }) };

    const result = await publishProgressReport(admin, 'r1');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected publish success');
    expect(result.newlyPublished).toBe(false);
    expect(result.report.is_published).toBe(true);
  });

  it('reports a recoverable conflict when a draft changes during publication', async () => {
    let loadCount = 0;
    const updateChain: any = {
      eq: () => updateChain,
      is: () => updateChain,
      or: () => updateChain,
      select: () => updateChain,
      maybeSingle: async () => ({ data: null, error: null }),
    };
    const selectChain: any = {
      eq: () => selectChain,
      maybeSingle: async () => {
        loadCount += 1;
        return {
          data: loadCount === 1
            ? complete
            : { ...complete, updated_at: '2026-10-01T08:05:00.000Z' },
          error: null,
        };
      },
    };
    const admin = { from: () => ({ select: () => selectChain, update: () => updateChain }) };

    const result = await publishProgressReport(admin, 'r1', {}, { expectedUpdatedAt: complete.updated_at });
    expect(result).toMatchObject({ ok: false, status: 409, code: 'STALE_REPORT_DRAFT' });
  });
});
