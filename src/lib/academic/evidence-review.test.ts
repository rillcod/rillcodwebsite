import { describe, expect, it, vi } from 'vitest';
import { loadEvidenceReview } from './evidence-review';

function database(results: Record<string, any[]>) {
  return { from: vi.fn((table: string) => {
    const result = results[table]?.shift() ?? { data: [], count: 0 };
    const query: any = { then: (resolve: any) => Promise.resolve(result).then(resolve) };
    for (const method of ['select', 'or', 'order', 'limit', 'in']) query[method] = vi.fn(() => query);
    return query;
  }) };
}

describe('assessment evidence review', () => {
  it('groups saved marks under their existing assessment editor and scopes every source read', async () => {
    const db = database({
      assignments: [{ data: [{ id: 'a', title: 'Project' }], count: 1 }, { data: [{ id: 'a', title: 'Project' }] }],
      academic_assessment_evidence: [{ data: [
        { id: 'one', evidence_type: 'assignment_submission', assessment_id: 'a' },
        { id: 'two', evidence_type: 'assignment_submission', assessment_id: 'a' },
      ], count: 2 }],
    });
    const scope = vi.fn(query => query);
    const review = await loadEvidenceReview(db, scope);
    expect(review.items).toHaveLength(1);
    expect(review.items[0].href).toBe('/dashboard/assignments/a/edit');
    expect(review.items[0].detail).toContain('2 saved mark');
    expect(scope).toHaveBeenCalledTimes(3);
  });

  it('does not create a dead edit link when the original assessment is unavailable', async () => {
    const db = database({ academic_assessment_evidence: [{ data: [
      { id: 'one', evidence_type: 'cbt_session', assessment_id: 'missing' },
    ], count: 1 }] });
    const review = await loadEvidenceReview(db, query => query);
    expect(review.items[0].href).toBeNull();
    expect(review.items[0].detail).toContain('administrator');
  });

  it('reports partial reads as failures and makes truncation visible', async () => {
    const broken = database({ assignments: [{ error: { message: 'unavailable' } }] });
    await expect(loadEvidenceReview(broken, query => query)).rejects.toThrow('could not be loaded');
    const large = database({ assignments: [{ data: [], count: 51 }] });
    expect((await loadEvidenceReview(large, query => query)).truncated).toBe(true);
  });
});
