import { beforeEach, describe, expect, it, vi } from 'vitest';

const monitorState = vi.hoisted(() => ({
  lease: 'acquired' as 'acquired' | 'busy' | 'unavailable',
  historyWriteFails: false,
}));

// recordOutcome writes the run to Supabase. Mocked so these assert what the
// scheduler is answered, not whether a database was reachable — the real client
// makes a network call and every test here would time out waiting for it.
vi.mock('@/lib/supabase/admin', () => {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    insert: async () => ({ error: monitorState.historyWriteFails ? { message: 'history unavailable' } : null }),
    upsert: async () => ({ error: null }),
    update: () => chain,
    maybeSingle: async () => ({ data: null }),
  };
  return {
    createAdminClient: () => ({
      from: () => chain,
      rpc: async (name: string) => {
        if (name === 'claim_cron_job_run') {
          if (monitorState.lease === 'unavailable') return { data: null, error: { message: 'function missing' } };
          return { data: monitorState.lease === 'acquired', error: null };
        }
        if (name === 'prune_cron_run_history') return { data: 0, error: null };
        return { data: true, error: null };
      },
    }),
  };
});

import { cronResultSucceeded, runMonitoredCron } from './cron-monitor';

describe('cron result classification', () => {
  it('accepts a successful HTTP result', () => {
    expect(cronResultSucceeded(200, { success: true, processed: 4 })).toBe(true);
  });

  it('rejects HTTP failures and explicit payload failures', () => {
    expect(cronResultSucceeded(500, { success: true })).toBe(false);
    expect(cronResultSucceeded(200, { success: false })).toBe(false);
    expect(cronResultSucceeded(200, { ok: false })).toBe(false);
  });

  it('treats partial processing failures as unhealthy', () => {
    expect(cronResultSucceeded(200, { failed: 1 })).toBe(false);
    expect(cronResultSucceeded(200, { errors: 2 })).toBe(false);
    expect(cronResultSucceeded(200, { errors: ['provider unavailable'] })).toBe(false);
  });
});

/**
 * What the external scheduler is told.
 *
 * cron-job.org disables a job that keeps answering 5xx, and it did: four
 * "fetch failed" runs of process-notifications inside twelve minutes on 7 Aug
 * — an outbound send timing out — each answered 500, and the schedule was
 * switched off. A queue meant to drain every minute then ran twice in 37 hours.
 *
 * The failure still has to be recorded and alerted on. It must not also cost
 * us the schedule.
 */
describe('what the scheduler is answered', () => {
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  beforeEach(() => {
    monitorState.lease = 'acquired';
    monitorState.historyWriteFails = false;
  });

  it('answers 200 when the job throws, so the schedule survives a timeout', async () => {
    // Annotated because a handler that only throws infers as `never`, and the
    // returned Response then has no properties to assert on.
    const response = await runMonitoredCron<Response>('test-job', 1, async () => {
      throw new Error('fetch failed');
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, handled: true, error: 'fetch failed', upstream_status: 500 });
  });

  it('answers 200 when the handler itself returns a 5xx', async () => {
    const response = await runMonitoredCron('test-job', 1, async () =>
      json({ error: 'provider down', sent: 0 }, 503));
    expect(response.status).toBe(200);
    const body = await response.json();
    // The original payload survives, with the real status alongside it.
    expect(body).toMatchObject({ error: 'provider down', sent: 0, upstream_status: 503, ok: false });
  });

  it('passes a healthy run straight through', async () => {
    const response = await runMonitoredCron('test-job', 1, async () =>
      json({ success: true, processed: 3 }, 200));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, processed: 3 });
  });

  it('still fails loudly on a bad secret', async () => {
    // A wrong or missing CRON_SECRET is misconfiguration, not a transient
    // fault. A scheduler calling an endpoint it can never authenticate against
    // SHOULD go red rather than retry politely for ever.
    for (const status of [401, 403]) {
      const response = await runMonitoredCron('test-job', 1, async () =>
        json({ error: 'Unauthorized' }, status));
      expect(response.status).toBe(status);
    }
  });

  it('does not start the handler when another instance owns the job lease', async () => {
    monitorState.lease = 'busy';
    const handler = vi.fn(async () => json({ success: true }, 200));
    const response = await runMonitoredCron('test-job', 1, handler);
    expect(handler).not.toHaveBeenCalled();
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      success: true,
      skipped: true,
      reason: 'already_running',
    });
  });

  it('keeps work available during migration rollout and exposes monitoring failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    monitorState.lease = 'unavailable';
    monitorState.historyWriteFails = true;
    const handler = vi.fn(async () => json({ success: true, processed: 1 }, 200));
    const response = await runMonitoredCron('test-job', 1, handler);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get('x-rillcod-monitoring')).toBe('unavailable');
    consoleSpy.mockRestore();
  });
});
