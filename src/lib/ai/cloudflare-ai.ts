/**
 * Cloudflare Workers AI — the free tier this platform was missing.
 *
 * Every account gets 10,000 Neurons per day, resetting at 00:00 UTC, across
 * ~80 models including FLUX, Whisper and Llama. For this app that is roughly
 * 2,000 small images or 1,300 text responses a day at no cost, on the same
 * Cloudflare account the site already deploys from.
 *
 * ── Why this sits at the top of the free tier ────────────────────────────────
 *
 * Image generation was in a bad state before this. Both Gemini image models
 * (gemini-2.0-flash-preview-image-generation, imagen-3.0-generate-001) now 404
 * — retired — so geminiGenerateImage always returned null and every picture in
 * the product came from the Pollinations fallback. Pollinations is genuinely
 * keyless, which is why it stays as the last resort, but the anonymous tier is
 * capped at one request per 15 seconds and its free output can carry a
 * watermark. That is not a foundation for lesson content.
 *
 * FLUX.1 Schnell here is free, unwatermarked, and fast.
 *
 * ── Cost safety ──────────────────────────────────────────────────────────────
 *
 * Past the daily Neurons the account bills at $0.011 per 1,000. Every function
 * below returns null rather than throwing when unconfigured, so a missing key
 * degrades to the next provider instead of failing a request — and the free
 * daily pool is shared across models, so the queue order matters: small models
 * first, and Pollinations still catches the overflow for free.
 */

const API_BASE = 'https://api.cloudflare.com/client/v4/accounts';

/**
 * Text. Capable-and-fast first, then the strongest, then the cheapest.
 *
 * Every id here was checked against the account's live catalogue rather than
 * written from memory — `@cf/meta/llama-3.1-8b-instruct-fast` was in this list
 * and does not exist, which is the same failure that left both Gemini image
 * models 404ing for months. If you add one, verify it:
 *   GET /client/v4/accounts/{account}/ai/models/search
 */
export const CF_TEXT_MODELS = [
  '@cf/openai/gpt-oss-20b',
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
  // Cheapest in Neurons — the one that keeps answering late in the day.
  '@cf/meta/llama-3.2-3b-instruct',
] as const;

/** Schnell is the cheap, fast FLUX variant — a few Neurons per 512px image. */
export const CF_IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
export const CF_WHISPER_MODEL = '@cf/openai/whisper-large-v3-turbo';

/**
 * Text to speech, cheapest-working first.
 *
 * Deepgram Aura returns raw MP3 bytes with `content-type: audio/mpeg`, not a
 * JSON envelope — different from every other model here, and getting it wrong
 * yields a valid-looking response containing nothing playable.
 *
 * `@cf/myshell-ai/melotts` is deliberately absent. It is listed in the account
 * catalogue and answers HTTP 500 (`AiError`, code 3043) for a plain sentence,
 * so leading with it would spend a round trip to fail. Re-test before adding.
 */
export const CF_TTS_MODELS = [
  '@cf/deepgram/aura-2-en',
  '@cf/deepgram/aura-1',
] as const;

/** Longer than a paragraph or two is a download, not a page reading itself. */
export const CF_TTS_MAX_CHARS = 2_000;

export function hasCloudflareAi(): boolean {
  return Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN,
  );
}

function endpoint(model: string): string {
  return `${API_BASE}/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`;
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` };
}

export type CloudflareImage = { base64: string; mimeType: string; model: string };

/**
 * Generate an image. Returns null when unconfigured or unavailable so the
 * caller falls through to Pollinations rather than failing.
 *
 * FLUX on Workers AI answers with base64 JPEG in `result.image`. Older models
 * on this endpoint stream raw binary instead, so both shapes are handled —
 * getting this wrong looks like a working call that yields an empty picture.
 */
export async function cloudflareGenerateImage(
  prompt: string,
  signal?: AbortSignal,
): Promise<CloudflareImage | null> {
  if (!hasCloudflareAi()) return null;

  try {
    const response = await fetch(endpoint(CF_IMAGE_MODEL), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, steps: 4 }),
      signal,
    });

    if (!response.ok) {
      console.warn(`[cloudflare-ai] image ${response.status}`);
      return null;
    }

    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      const data = await response.json().catch(() => null);
      const image = data?.result?.image;
      if (typeof image === 'string' && image.length) {
        return { base64: image, mimeType: 'image/jpeg', model: CF_IMAGE_MODEL };
      }
      console.warn('[cloudflare-ai] image response carried no data');
      return null;
    }

    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength) return null;
    return {
      base64: Buffer.from(buffer).toString('base64'),
      mimeType: contentType || 'image/png',
      model: CF_IMAGE_MODEL,
    };
  } catch (err) {
    console.warn('[cloudflare-ai] image request failed:', (err as Error)?.message);
    return null;
  }
}

/**
 * Transcribe audio with Whisper. Free, where the Hugging Face equivalent bills
 * per second of audio — so this is tried first.
 */
export async function cloudflareTranscribe(
  audio: ArrayBuffer,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!hasCloudflareAi()) return null;

  try {
    const response = await fetch(endpoint(CF_WHISPER_MODEL), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/octet-stream' },
      body: audio,
      signal,
    });

    if (!response.ok) {
      console.warn(`[cloudflare-ai] whisper ${response.status}`);
      return null;
    }

    const data = await response.json().catch(() => null);
    const text = data?.result?.text;
    return typeof text === 'string' && text.trim() ? text.trim() : null;
  } catch (err) {
    console.warn('[cloudflare-ai] whisper request failed:', (err as Error)?.message);
    return null;
  }
}

export type CloudflareSpeech = { audio: Buffer; mimeType: string; model: string };

/**
 * Read text aloud. Returns null when unconfigured or every model fails.
 *
 * Audio comes back as raw bytes rather than base64 in JSON, so the caller can
 * stream it straight to an <audio> element without paying the ~33% base64 tax
 * on every lesson paragraph a learner plays.
 */
export async function cloudflareTextToSpeech(
  text: string,
  voice?: string,
  signal?: AbortSignal,
): Promise<CloudflareSpeech | null> {
  if (!hasCloudflareAi()) return null;

  const trimmed = text.trim().slice(0, CF_TTS_MAX_CHARS);
  if (!trimmed) return null;

  for (const model of CF_TTS_MODELS) {
    try {
      const response = await fetch(endpoint(model), {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(voice ? { text: trimmed, speaker: voice } : { text: trimmed }),
        signal,
      });

      if (!response.ok) {
        console.warn(`[cloudflare-ai] tts ${model} ${response.status}`);
        continue;
      }

      const contentType = response.headers.get('content-type') ?? '';

      // A JSON body here means an error envelope, not audio: Aura answers
      // audio/mpeg on success. Treating it as sound would hand the browser a
      // few hundred bytes of error text renamed .mp3.
      if (contentType.includes('application/json')) {
        console.warn(`[cloudflare-ai] tts ${model} returned JSON, not audio`);
        continue;
      }

      const audio = Buffer.from(await response.arrayBuffer());
      if (audio.length < 512) {
        console.warn(`[cloudflare-ai] tts ${model} returned ${audio.length} bytes`);
        continue;
      }

      return { audio, mimeType: contentType || 'audio/mpeg', model };
    } catch (err) {
      console.warn(`[cloudflare-ai] tts ${model} failed:`, (err as Error)?.message);
    }
  }

  return null;
}

/** Plain system+user text. Returns null so callers keep their own fallbacks. */
export async function cloudflareGenerateText(
  system: string,
  user: string,
  options: { maxTokens?: number; temperature?: number; signal?: AbortSignal } = {},
): Promise<{ text: string; model: string } | null> {
  if (!hasCloudflareAi()) return null;

  for (const model of CF_TEXT_MODELS) {
    try {
      const response = await fetch(endpoint(model), {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          max_tokens: options.maxTokens ?? 4096,
          temperature: options.temperature ?? 0.3,
        }),
        signal: options.signal,
      });

      if (!response.ok) {
        // Out of Neurons for the day, or model unavailable. Try the next.
        console.warn(`[cloudflare-ai] ${model} ${response.status}`);
        continue;
      }

      const data = await response.json().catch(() => null);
      const text = data?.result?.response;
      if (typeof text === 'string' && text.trim()) {
        return { text: text.trim(), model };
      }
    } catch (err) {
      console.warn(`[cloudflare-ai] ${model} failed:`, (err as Error)?.message);
    }
  }

  return null;
}
