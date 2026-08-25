import { NextRequest, NextResponse } from 'next/server';
import { withApiProxy } from '@/lib/api-wrapper';
import { CF_TTS_MAX_CHARS, hasCloudflareAi } from '@/lib/ai/cloudflare-ai';
import { getOrCreateSpeech } from '@/lib/ai/speech-cache';

/**
 * POST /api/ai/tts — read a passage aloud.
 *
 * This directory existed with no route.ts in it: the feature was started and
 * abandoned. It is worth finishing because the audience is primary and
 * secondary learners, many reading in a second language, and Deepgram Aura runs
 * on the free Workers AI allocation rather than a per-character bill.
 *
 * Unlike the other AI routes this is not staff-only. Requiring admin|teacher
 * would gate a reading aid behind the people who least need it, so it takes any
 * signed-in user — withApiProxy still supplies the rate limit and origin check,
 * which is what stops a page looping audio and draining the daily Neurons.
 *
 * Responds with raw audio/mpeg. A base64 JSON envelope would inflate every
 * paragraph by about a third for no benefit: the browser wants a blob it can
 * hand to an <audio> element.
 */
async function postHandler(req: NextRequest) {
  if (!hasCloudflareAi()) {
    return NextResponse.json(
      { error: 'Read-aloud is not configured.' },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  // A role name ('lesson', 'story', 'instruction') or a raw Aura voice.
  // resolveVoice falls back rather than letting an unknown speaker 400.
  const voice = typeof body.voice === 'string' ? body.voice : undefined;

  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  // Say so rather than truncating silently: a learner following along would
  // otherwise hear the passage stop mid-sentence with no indication why.
  if (text.length > CF_TTS_MAX_CHARS) {
    return NextResponse.json(
      {
        error: `Passage too long. Send at most ${CF_TTS_MAX_CHARS} characters — split longer text into sections.`,
        maxChars: CF_TTS_MAX_CHARS,
        received: text.length,
      },
      { status: 413 },
    );
  }

  const speech = await getOrCreateSpeech(text, voice);

  if (!speech) {
    return NextResponse.json(
      { error: 'Read-aloud is temporarily unavailable. Please try again.' },
      { status: 503 },
    );
  }

  // Normal path: the audio lives in R2 under a hash of its own text, so the
  // browser is sent there directly. Replays and the other thirty-nine learners
  // in the class never reach Workers AI at all, which is what makes listening
  // as often as you like actually free.
  if (speech.url) {
    return NextResponse.json({
      url: speech.url,
      cached: speech.cached,
      model: speech.model,
      mimeType: speech.mimeType,
    });
  }

  // Storage was unreachable but the audio is good. Return the bytes so the
  // lesson still plays; it simply was not saved for next time.
  return new NextResponse(new Uint8Array(speech.audio!), {
    status: 200,
    headers: {
      'Content-Type': speech.mimeType,
      'Content-Length': String(speech.audio!.length),
      'Cache-Control': 'private, max-age=86400',
      'X-Model': speech.model,
      'X-Cache': 'store-unavailable',
    },
  });
}

export const POST = (req: any, ctx: any) =>
  withApiProxy(postHandler, {
    requireAuth: true,
    requireTenant: false,
  })(req, ctx);
