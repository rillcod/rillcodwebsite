import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Queued teaching preparation must never fail the thing that triggered it.
 *
 * `runClassAcademicReadiness` rethrows on purpose, so `prepareTeaching` can answer
 * `ok: false` to a caller that awaited it. Every other caller fires and walks away:
 * class create, prospective approval, resend activation, the onboarding sweep, and
 * — twice — the payment success path. Those used to call it through `after(() => …)`
 * or a bare `void`, where the same rethrow becomes an unhandled rejection while a
 * payment is still being recorded. These pin the containment.
 */

// vi.mock factories are hoisted above ordinary consts, and prepare-teaching
// evaluates these imports as soon as it loads — so the fns have to be hoisted too.
const { runClassAcademicReadiness, afterMock } = vi.hoisted(() => ({
  runClassAcademicReadiness: vi.fn(),
  afterMock: vi.fn(),
}));

vi.mock('next/server', () => ({
  after: (cb: () => Promise<void> | void) => afterMock(cb),
}));

vi.mock('@/lib/academic/prepare-class-readiness', () => ({
  runClassAcademicReadiness,
}));

// Pulled in by the module under test; irrelevant to the school pathway.
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/special-programs/launch-teaching', () => ({
  launchSpecialProgramTeaching: vi.fn(),
}));
vi.mock('@/lib/special-programs/teaching-readiness', () => ({
  buildTeachingReadiness: vi.fn(),
}));
vi.mock('@/lib/special-programs/ensure-cohort-class', () => ({
  loadOfferingClasses: vi.fn(),
  pickPrimaryCohort: vi.fn(),
  syncOfferingLinks: vi.fn(),
}));

import { queuePrepareTeaching } from './prepare-teaching';

/** Run whatever was handed to `after()`, the way the runtime would. */
async function flushAfter(): Promise<void> {
  for (const [cb] of afterMock.mock.calls) await cb();
}

describe('queuePrepareTeaching — school pathway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('queues preparation after the response instead of blocking it', () => {
    queuePrepareTeaching({ pathway: 'school', classId: 'class-1' });

    expect(afterMock).toHaveBeenCalledTimes(1);
    // Nothing has run yet — the response goes out first.
    expect(runClassAcademicReadiness).not.toHaveBeenCalled();
  });

  it('swallows a preparation failure instead of rejecting', async () => {
    runClassAcademicReadiness.mockRejectedValueOnce(new Error('no official direction'));

    queuePrepareTeaching({ pathway: 'school', classId: 'class-1' });

    // The assertion is the absence of a rejection: this is exactly what took down
    // the payment path when the throw escaped into `after()`.
    await expect(flushAfter()).resolves.toBeUndefined();
    expect(runClassAcademicReadiness).toHaveBeenCalledWith('class-1');
  });

  it('still runs preparation when there is no request scope for after()', async () => {
    // Cron repair sweeps reach the payment path with no request scope, where
    // after() throws. Preparation must fall back, not vanish.
    afterMock.mockImplementation(() => {
      throw new Error('after() was called outside a request scope');
    });
    runClassAcademicReadiness.mockResolvedValueOnce(undefined);

    expect(() =>
      queuePrepareTeaching({ pathway: 'school', classId: 'class-2' }),
    ).not.toThrow();

    await vi.waitFor(() =>
      expect(runClassAcademicReadiness).toHaveBeenCalledWith('class-2'),
    );
  });

  it('does no work for a class that is not there', () => {
    queuePrepareTeaching({ pathway: 'school', classId: null });
    queuePrepareTeaching({ pathway: 'school', classId: undefined });

    expect(afterMock).not.toHaveBeenCalled();
  });
});
