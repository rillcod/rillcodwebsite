import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Read-aloud is the one AI route open to learners rather than staff, so its
 * door needs testing in both directions: signed-out is refused, and a student
 * is NOT refused — gating a reading aid behind admin|teacher would put it out
 * of reach of the people it exists for.
 */

const authState: { userId: string | null; role: string | null } = { userId: null, role: null };

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

const speech = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('@/lib/ai/cloudflare-ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/cloudflare-ai')>();
  return { ...actual, hasCloudflareAi: () => true };
});
vi.mock('@/lib/ai/speech-cache', () => ({ getOrCreateSpeech: speech.run }));

function post(text: string): NextRequest {
  return new NextRequest('http://localhost/api/ai/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}

beforeEach(() => {
  authState.userId = null;
  authState.role = null;
  speech.run.mockReset().mockResolvedValue({
    url: 'https://r2.example/tts/v1/abc.mp3?sig=x',
    mimeType: 'audio/mpeg',
    cached: true,
    model: '@cf/deepgram/aura-2-en',
  });
});

describe('the door', () => {
  it('refuses a signed-out caller', async () => {
    const { POST } = await import('./tts/route');
    expect((await POST(post('hello'), { params: {} })).status).toBe(401);
  });

  it.each(['student', 'parent', 'teacher', 'admin', 'school'])(
    'lets %s through — this is a reading aid, not a staff tool',
    async (role) => {
      authState.userId = 'u1';
      authState.role = role;
      const { POST } = await import('./tts/route');
      const res = await POST(post('The water cycle has four stages.'), { params: {} });
      expect(res.status).toBe(200);
    },
  );
});

describe('the response', () => {
  beforeEach(() => {
    authState.userId = 'u1';
    authState.role = 'student';
  });

  it('hands back a stored URL so replays never reach Workers AI', async () => {
    const { POST } = await import('./tts/route');
    const res = await POST(post('Evaporation, condensation, precipitation.'), { params: {} });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.url).toContain('r2.example');
    expect(body.cached).toBe(true);
    expect(body.model).toBe('@cf/deepgram/aura-2-en');
  });

  it('still plays when storage is down, by sending the bytes instead', async () => {
    speech.run.mockResolvedValue({
      audio: Buffer.alloc(4096, 1),
      mimeType: 'audio/mpeg',
      cached: false,
      model: '@cf/deepgram/aura-1',
    });
    const { POST } = await import('./tts/route');
    const res = await POST(post('hello'), { params: {} });

    expect(res.headers.get('content-type')).toBe('audio/mpeg');
    expect(res.headers.get('x-cache')).toBe('store-unavailable');
    expect(Buffer.from(await res.arrayBuffer()).length).toBe(4096);
  });

  it('rejects an over-long passage instead of cutting it off mid-sentence', async () => {
    const { POST } = await import('./tts/route');
    const res = await POST(post('a'.repeat(2_001)), { params: {} });
    expect(res.status).toBe(413);
    expect(speech.run).not.toHaveBeenCalled();
  });

  it('requires text', async () => {
    const { POST } = await import('./tts/route');
    expect((await POST(post('   '), { params: {} })).status).toBe(400);
  });

  it('reports 503 when every voice model failed', async () => {
    speech.run.mockResolvedValue(null);
    const { POST } = await import('./tts/route');
    expect((await POST(post('hello'), { params: {} })).status).toBe(503);
  });
});
