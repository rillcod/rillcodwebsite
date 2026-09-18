import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch } from './api-fetch';

describe('apiFetch container retry', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('transparently retries when Cloudflare returns 503 SERVICE_STARTING', async () => {
    let callCount = 0;
    global.fetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(
          JSON.stringify({ error: 'Rillcod is starting. Please try again in a few seconds.', code: 'SERVICE_STARTING' }),
          {
            status: 503,
            headers: {
              'content-type': 'application/json',
              'retry-after': '0.01',
              'x-rillcod-service-state': 'starting',
            },
          },
        );
      }
      return new Response(JSON.stringify({ success: true, data: { id: 'saved-1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const res = await apiFetch('/api/progress-reports', {
      method: 'POST',
      body: JSON.stringify({ student_id: 's1' }),
    });

    expect(callCount).toBe(2);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('saved-1');
  });

  it('does not retry genuine non-starting 500 errors', async () => {
    let callCount = 0;
    global.fetch = vi.fn(async () => {
      callCount++;
      return new Response(
        JSON.stringify({ error: 'Database constraint failed' }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      );
    });

    const res = await apiFetch('/api/progress-reports', {
      method: 'POST',
      body: JSON.stringify({ student_id: 's1' }),
    });

    expect(callCount).toBe(1);
    expect(res.status).toBe(500);
  });
});
