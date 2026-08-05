import { describe, expect, it } from 'vitest';
import { resolveAssignmentTermId } from './session';

function mockDb(classRow: Record<string, unknown> | null) {
  return {
    from: (table: string) => {
      if (table === 'classes') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: classRow }),
            }),
          }),
        };
      }
      if (table === 'academic_terms') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { id: 'live-term' } }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null }) }),
        }),
      };
    },
  };
}

describe('resolveAssignmentTermId', () => {
  it('uses school term_id for regular classes without an offering', async () => {
    const term = await resolveAssignmentTermId(mockDb({
      school_id: 's1',
      term_id: 'term-school',
      academic_offering_id: null,
      offering_period_id: null,
    }) as any, {
      classId: 'c1',
      fallbackLive: false,
    });
    expect(term).toBe('term-school');
  });

  it('ignores school term_id on offering-backed cohort classes', async () => {
    const term = await resolveAssignmentTermId(mockDb({
      school_id: 's1',
      term_id: 'term-school',
      academic_offering_id: 'off-1',
      offering_period_id: 'period-1',
    }) as any, {
      classId: 'c1',
    });
    expect(term).toBeNull();
  });
});
