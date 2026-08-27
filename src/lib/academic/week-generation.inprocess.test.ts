import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokePlanWeekGenerator } = vi.hoisted(() => ({
  invokePlanWeekGenerator: vi.fn(),
}));

vi.mock('@/lib/academic/plan-week-generators', () => ({
  invokePlanWeekGenerator,
}));

import { generatePlanWeek } from './week-generation';

describe('generatePlanWeek', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs generators in-process instead of HTTP loopback', async () => {
    invokePlanWeekGenerator
      .mockResolvedValueOnce(
        new Response(
          'data: {"done":true,"generated":1,"skipped":0,"failures":[],"truncated":false}\n\n',
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ generated: 1, skipped: 0 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ generated: 1, skipped: 0 }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          'data: {"done":true,"generated":1,"skipped":0,"failures":[],"truncated":false}\n\n',
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          'data: {"done":true,"generated":1,"skipped":0,"failures":[],"truncated":false}\n\n',
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        ),
      );

    const outcome = await generatePlanWeek({
      planId: 'plan-1',
      week: 1,
      session: 1,
      cronSecret: 'test-secret',
      types: ['lessons', 'slides', 'flashcards', 'assignments', 'projects'],
    });

    expect(invokePlanWeekGenerator).toHaveBeenCalledTimes(5);
    expect(invokePlanWeekGenerator.mock.calls[0][0]).toMatchObject({
      planId: 'plan-1',
      type: 'lessons',
      week: 1,
      session: 1,
      cronSecret: 'test-secret',
    });
    expect(outcome.generated).toBeGreaterThan(0);
    expect(outcome.failedTypes).toEqual([]);
  });

  it('records failed types without stopping the rest', async () => {
    invokePlanWeekGenerator
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'blocked' }), { status: 422 }))
      .mockResolvedValueOnce(
        new Response(
          'data: {"done":true,"generated":1,"skipped":0,"failures":[],"truncated":false}\n\n',
          { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
        ),
      );

    const outcome = await generatePlanWeek({
      planId: 'plan-1',
      week: 2,
      cronSecret: 'test-secret',
      types: ['assignments', 'projects'],
    });

    expect(outcome.failedTypes).toEqual(['assignments']);
    expect(outcome.generated).toBe(1);
    expect(outcome.byType.assignments).toMatchObject({ error: 'blocked', retryable: false });
  });

  it('marks temporary provider responses for the inventory-aware retry', async () => {
    invokePlanWeekGenerator.mockResolvedValueOnce(
      new Response('upstream gateway details', { status: 503 }),
    );

    const outcome = await generatePlanWeek({
      planId: 'plan-1',
      week: 3,
      types: ['slides'],
    });

    expect(outcome.byType.slides).toMatchObject({
      error: 'The slides could not be prepared. Saved work was kept.',
      retryable: true,
    });
    expect(JSON.stringify(outcome)).not.toContain('HTTP 503');
    expect(JSON.stringify(outcome)).not.toContain('gateway details');
  });

  it('treats a missing-lesson slides response as retryable', async () => {
    invokePlanWeekGenerator.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'Generate or add the lesson before creating its slides',
        }),
        { status: 409 },
      ),
    );

    const outcome = await generatePlanWeek({
      planId: 'plan-1',
      week: 4,
      types: ['slides'],
    });

    expect(outcome.failedTypes).toEqual(['slides']);
    expect(outcome.byType.slides).toMatchObject({
      error: 'Generate or add the lesson before creating its slides',
      retryable: true,
    });
  });
});
