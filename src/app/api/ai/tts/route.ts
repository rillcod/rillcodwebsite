import { NextRequest, NextResponse } from 'next/server';

const HF_API = 'https://api-inference.huggingface.co/models';
// facebook/mms-tts-eng: simple inputs-only TTS, no speaker embeddings required
const MODEL = 'facebook/mms-tts-eng';

const MAX_CHARS = 1000;

export async function POST(req: NextRequest) {
  try {
    if (!process.env.HUGGINGFACE_API_KEY) {
      return NextResponse.json({ error: 'Hugging Face API key not configured.' }, { status: 503 });
    }

    const { text } = await req.json();

    if (!text?.trim()) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }

    // Trim to model-safe length
    const safeText = text.trim().slice(0, MAX_CHARS);

    const hfRes = await fetch(`${HF_API}/${MODEL}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: safeText }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!hfRes.ok) {
      const errText = await hfRes.text();
      if (hfRes.status === 503) {
        return NextResponse.json({ error: 'TTS model is loading, please try again in 20 seconds.' }, { status: 503 });
      }
      return NextResponse.json({ error: `HF error: ${errText}` }, { status: hfRes.status });
    }

    const audioBuffer = await hfRes.arrayBuffer();
    const base64 = Buffer.from(audioBuffer).toString('base64');
    const contentType = hfRes.headers.get('content-type') ?? 'audio/wav';

    return NextResponse.json({
      data: {
        base64,
        dataUrl: `data:${contentType};base64,${base64}`,
        contentType,
        charCount: safeText.length,
      },
    });
  } catch (err: any) {
    if (err.name === 'TimeoutError') {
      return NextResponse.json({ error: 'TTS timed out. Try with shorter text.' }, { status: 504 });
    }
    return NextResponse.json({ error: err.message ?? 'Text-to-speech failed' }, { status: 500 });
  }
}
