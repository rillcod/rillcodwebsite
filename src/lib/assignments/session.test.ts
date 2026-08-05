import { describe, expect, it } from 'vitest';
import { resolveAssignmentTermId } from './session';

function mockDb(opts: {
  classRow?: Record<string, unknown> | null;
  offeringRow?: Record<string, unknown> | null;
}) {
  return {
    from: (table: string) => {
      if (table === 'classes') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: opts.classRow ?? null }),
            }),
          }),
        };
      }
      if (table === 'academic_offerings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: opts.offeringRow ?? null }),
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
    const term = await resolveAssignmentTermId(
      mockDb({
        classRow: {
          school_id: 's1',
          term_id: 'term-school',
          academic_offering_id: null,
          offering_period_id: null,
        },
      }) as any,
      { classId: 'c1', fallbackLive: false },
    );
    expect(term).toBe('term-school');
  });

  it('keeps school term_id when the class sits on a termly offering', async () => {
    const term = await resolveAssignmentTermId(
      mockDb({
        classRow: {
          school_id: 's1',
          term_id: 'term-school',
          academic_offering_id: 'off-school',
          offering_period_id: 'period-1',
        },
        offeringRow: { academic_model: 'termly_school' },
      }) as any,
      { classId: 'c1' },
    );
    expect(term).toBe('term-school');
  });

  it('ignores school term_id on duration programme cohort classes', async () => {
    const term = await resolveAssignmentTermId(
      mockDb({
        classRow: {
          school_id: 's1',
          term_id: 'term-school',
          academic_offering_id: 'off-1',
          offering_period_id: 'period-1',
        },
        offeringRow: { academic_model: 'duration_programme' },
      }) as any,
      { classId: 'c1' },
    );
    expect(term).toBeNull();
  });

  it('still honours an explicit term_id on duration programmes', async () => {
    const term = await resolveAssignmentTermId(
      mockDb({
        classRow: {
          school_id: 's1',
          term_id: 'term-school',
          academic_offering_id: 'off-1',
          offering_period_id: 'period-1',
        },
        offeringRow: { academic_model: 'duration_programme' },
      }) as any,
      { classId: 'c1', termId: 'explicit-term' },
    );
    expect(term).toBe('explicit-term');
  });

  it('allows live-term fallback for termly offerings with no class term', async () => {
    const term = await resolveAssignmentTermId(
      mockDb({
        classRow: {
          school_id: 's1',
          term_id: null,
          academic_offering_id: 'off-school',
          offering_period_id: null,
        },
        offeringRow: { academic_model: 'termly_school' },
      }) as any,
      { classId: 'c1' },
    );
    expect(term).toBe('live-term');
  });
});
