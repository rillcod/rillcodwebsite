import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * HTTP-door tests for the AI routes.
 *
 * These four routes shipped with no authentication at all: anyone on the
 * internet could POST to them and spend the Gemini and OpenRouter keys. The
 * unit tests around the AI libraries were green the whole time, because a
 * library test cannot see whether the route in front of it is locked.
 *
 * So these assert the door, not the model: who is turned away, and that staff
 * still get through. Everything downstream of the gate is stubbed — a door test
 * that needs a live model is a door test that will be deleted the first time it
 * flakes.
 */

const authState: { userId: string | null; role: string | null } = {
  userId: null,
  role: null,
};

vi.mock('@/proxies/tenant.proxy', () => ({
  tenantproxy: async (_req: unknown, res: any) => {
    if (authState.userId) res.headers.set('x-user-id', authState.userId);
    if (authState.role) res.headers.set('x-user-role', authState.role);
    return res;
  },
}));

vi.mock('@/proxies/rateLimit.proxy', () => ({ rateLimitproxy: async () => null }));

vi.mock('@/lib/operations/traffic-controls', () => ({
  loadTrafficControls: async () => ({ api_origin_guard_mode: 'off' }),
  evaluateMutationOrigin: () => ({ accepted: true, origin: null }),
  isSafeApiMethod: (m: string) => m === 'GET' || m === 'HEAD',
}));

vi.mock('@/lib/gemini/client', () => ({
  geminiGenerateImage: async () => null,
  geminiGenerateText: async () => null,
  hasGeminiKey: () => false,
}));

vi.mock('@/lib/ai/model-policy', () => ({
  modelQueueFor: async () => [],
  defaultFreeModel: async () => 'test/model',
}));

function jsonRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'the water cycle', type: 'flowchart' }),
  });
}

function audioRequest(path: string): NextRequest {
  const form = new FormData();
  form.set('audio', new File([new Uint8Array([1, 2, 3])], 'clip.mp3', { type: 'audio/mpeg' }));
  return new NextRequest(`http://localhost${path}`, { method: 'POST', body: form });
}

const ROUTES = [
  { name: 'image', path: '/api/ai/image', load: () => import('./image/route'), req: jsonRequest },
  { name: 'graphics', path: '/api/ai/graphics', load: () => import('./graphics/route'), req: jsonRequest },
  { name: 'video', path: '/api/ai/video', load: () => import('./video/route'), req: jsonRequest },
  { name: 'stt', path: '/api/ai/stt', load: () => import('./stt/route'), req: audioRequest },
] as const;

beforeEach(() => {
  authState.userId = null;
  authState.role = null;
  // No route under test may reach the network once the gate has done its job.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 502 })));
});

describe.each(ROUTES)('$path', ({ path, load, req }) => {
  it('rejects an anonymous caller with 401', async () => {
    const { POST } = await load();
    const res = await POST(req(path), { params: {} });
    expect(res.status).toBe(401);
  });

  it.each(['student', 'parent', 'school'])('rejects role %s with 403', async (role) => {
    authState.userId = 'user-1';
    authState.role = role;
    const { POST } = await load();
    const res = await POST(req(path), { params: {} });
    expect(res.status).toBe(403);
  });

  it.each(['admin', 'teacher'])('lets %s past the gate', async (role) => {
    authState.userId = 'user-1';
    authState.role = role;
    const { POST } = await load();
    const res = await POST(req(path), { params: {} });
    // What happens after the gate depends on keys and providers that are
    // stubbed out here. The property under test is only that the gate itself
    // did not turn staff away.
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
