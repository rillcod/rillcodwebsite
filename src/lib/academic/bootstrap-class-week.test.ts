import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The school pathway's Week 1.
 *
 * Special programmes generated their first class meeting on Prepare teaching, while
 * a school class only ever got a plan and then waited for the nightly sweep — which
 * is what "nothing generated" looked like to a school. This runs the same engine for
 * both. Content still lands held for approval; only the *plan* is published, and only
 * because the generators refuse to run against a draft.
 */

const {
  generatePlanWeek,
  notifyWeekReady,
  resolveGenerationRepairTypes,
  planUpdateSpy,
  trackingUpdateSpy,
  planRef,
} = vi.hoisted(() => ({
  generatePlanWeek: vi.fn(),
  notifyWeekReady: vi.fn(),
  resolveGenerationRepairTypes: vi.fn(),
  planUpdateSpy: vi.fn(),
  trackingUpdateSpy: vi.fn(),
  planRef: { current: null as Record<string, unknown> | null },
}));

// Only the two generators are stubbed. Everything else — normaliseTypes and the
// content-type constants the tracked-generation wrapper reads — must stay real, or
// this mock silently breaks every time that module gains a helper.
vi.mock('./week-generation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./week-generation')>()),
  generatePlanWeek,
  notifyWeekReady,
  currentDeliveryWeek: () => 1,
}));

vi.mock('./generation-repair', () => ({
  resolveGenerationRepairTypes,
}));

vi.mock('@/lib/supabase/admin', () => {
  const read: any = {
    select: () => read,
    eq: () => read,
    neq: () => read,
    order: () => read,
    limit: () => read,
    maybeSingle: async () => ({ data: planRef.current }),
  };
  return {
    createAdminClient: () => ({
      from: (table: string) => ({
        ...read,
        update: (patch: Record<string, unknown>) => {
          if (table === 'lesson_plans') planUpdateSpy(patch);
          else trackingUpdateSpy(patch);
          return { eq: async () => ({ error: null }) };
        },
      }),
    }),
  };
});

import { bootstrapClassTeachingWeek } from './bootstrap-class-week';

const PLAN = {
  id: 'plan-1',
  class_id: 'class-1',
  status: 'draft',
  plan_data: { weeks: [{ week: 1 }, { week: 2 }] },
  metadata: { auto_generate_settings: { enabled: true, types: ['lessons'] } },
  term_start: '2026-09-01',
  academic_offering_periods: { starts_on: '2026-09-01' },
};

describe('bootstrapClassTeachingWeek', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    planRef.current = { ...PLAN };
    resolveGenerationRepairTypes.mockResolvedValue(null);
    generatePlanWeek.mockResolvedValue({
      week: 1,
      generated: 3,
      skipped: 0,
      byType: {},
      failedTypes: [],
    });
    notifyWeekReady.mockResolvedValue(undefined);
  });

  it('generates the first class meeting through the shared engine', async () => {
    const outcome = await bootstrapClassTeachingWeek('class-1');

    expect(generatePlanWeek).toHaveBeenCalledTimes(1);
    expect(generatePlanWeek.mock.calls[0][0]).toMatchObject({
      planId: 'plan-1',
      week: 1,
      // One meeting only, so the model stays inside its context window.
      session: 1,
      // Held for approval: nobody has read this yet.
      autoPublish: false,
    });
    expect(outcome?.generated).toBe(3);
  });

  it('publishes the plan first, because generators refuse a draft', async () => {
    await bootstrapClassTeachingWeek('class-1');

    expect(planUpdateSpy).toHaveBeenCalledTimes(1);
    expect(planUpdateSpy.mock.calls[0][0]).toMatchObject({ status: 'published' });
  });

  it('leaves an already-published plan alone', async () => {
    planRef.current = { ...PLAN, status: 'published' };

    await bootstrapClassTeachingWeek('class-1');

    expect(planUpdateSpy).not.toHaveBeenCalled();
    expect(generatePlanWeek).toHaveBeenCalledTimes(1);
  });

  it('tells the teacher the week is waiting', async () => {
    await bootstrapClassTeachingWeek('class-1');

    expect(notifyWeekReady).toHaveBeenCalledTimes(1);
    expect(notifyWeekReady.mock.calls[0][1]).toMatchObject({
      planId: 'plan-1',
      classId: 'class-1',
      week: 1,
      session: 1,
      autoPublish: false,
    });
  });

  it('does nothing when the class has no plan yet', async () => {
    planRef.current = null;

    await expect(bootstrapClassTeachingWeek('class-1')).resolves.toBeNull();
    expect(generatePlanWeek).not.toHaveBeenCalled();
    expect(planUpdateSpy).not.toHaveBeenCalled();
  });

  it('does not publish a plan that has no weeks to teach', async () => {
    planRef.current = { ...PLAN, plan_data: { weeks: [] } };

    await expect(bootstrapClassTeachingWeek('class-1')).resolves.toBeNull();
    expect(planUpdateSpy).not.toHaveBeenCalled();
    expect(generatePlanWeek).not.toHaveBeenCalled();
  });

  it('ignores a blank class id', async () => {
    await expect(bootstrapClassTeachingWeek('')).resolves.toBeNull();
    expect(generatePlanWeek).not.toHaveBeenCalled();
  });
});
