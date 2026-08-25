import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CF_IMAGE_MODEL,
  CF_WHISPER_MODEL,
  cloudflareGenerateImage,
  cloudflareTranscribe,
  hasCloudflareAi,
} from './cloudflare-ai';

/**
 * Workers AI is the free tier: 10,000 Neurons a day, then $0.011 per 1,000.
 * Two properties keep that safe and useful — it is completely inert without
 * credentials, and every failure returns null so the caller drops to the next
 * provider instead of failing a lesson.
 */

const KEYS = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
  vi.restoreAllMocks();
});

function configure() {
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acct_test';
  process.env.CLOUDFLARE_API_TOKEN = 'token_test';
}

describe('inert without credentials', () => {
  it('reports itself unconfigured', () => {
    expect(hasCloudflareAi()).toBe(false);
    configure();
    expect(hasCloudflareAi()).toBe(true);
  });

  it('makes no network call and returns null', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await cloudflareGenerateImage('a diagram of the water cycle')).toBeNull();
    expect(await cloudflareTranscribe(new ArrayBuffer(8))).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('needs BOTH id and token — half-configured is not configured', () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct_test';
    expect(hasCloudflareAi()).toBe(false);
  });
});

describe('image generation', () => {
  beforeEach(configure);

  it('reads base64 out of the JSON envelope FLUX returns', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ result: { image: 'QUJD' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = await cloudflareGenerateImage('the water cycle');
    expect(result).toEqual({ base64: 'QUJD', mimeType: 'image/jpeg', model: CF_IMAGE_MODEL });
  });

  it('also accepts a raw binary body, which older models on this endpoint send', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    );
    const result = await cloudflareGenerateImage('the water cycle');
    expect(result?.mimeType).toBe('image/png');
    expect(result?.base64).toBe(Buffer.from([1, 2, 3]).toString('base64'));
  });

  it('returns null on an out-of-Neurons response rather than throwing', async () => {
    // The daily pool running out must degrade to Pollinations, not 500 a lesson.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('quota', { status: 429 }));
    expect(await cloudflareGenerateImage('anything')).toBeNull();
  });

  it('returns null when the network throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('socket hang up'));
    expect(await cloudflareGenerateImage('anything')).toBeNull();
  });
});

describe('transcription', () => {
  beforeEach(configure);

  it('returns the transcript text', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ result: { text: '  hello class  ' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(await cloudflareTranscribe(new ArrayBuffer(8))).toBe('hello class');
  });

  it('treats an empty transcript as no answer', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ result: { text: '   ' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(await cloudflareTranscribe(new ArrayBuffer(8))).toBeNull();
  });
});

describe('production wiring', () => {
  it('forwards both vars to the container', () => {
    // The Next app runs in the container, not the Worker, so an unforwarded var
    // is present in local dev and absent in production — exactly how the extra
    // Gemini keys were silently inert before.
    const gateway = readFileSync(
      path.join(process.cwd(), 'src/cloudflare/container-gateway.ts'),
      'utf8',
    );
    expect(gateway).toContain('CLOUDFLARE_ACCOUNT_ID');
    expect(gateway).toContain('CLOUDFLARE_API_TOKEN');
  });
});
