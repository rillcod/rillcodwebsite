import { NextRequest, NextResponse } from 'next/server';

const HF_API = 'https://router.huggingface.co/hf-inference/models';
const MODEL = 'openai/whisper-large-v3';

export async function POST(req: NextRequest) {
  try {
    if (!process.env.HUGGINGFACE_API_KEY) {
      return NextResponse.json({ error: 'Hugging Face API key not configured.' }, { status: 503 });
    }

    const formData = await req.formData();
    const file = formData.get('audio') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'audio file is required' }, { status: 400 });
    }

    // Whisper accepts audio up to ~25MB
    const MAX_BYTES = 25 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large. Max 25 MB.' }, { status: 413 });
    }

    const audioBuffer = await file.arrayBuffer();

    const hfRes = await fetch(`${HF_API}/${MODEL}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        'Content-Type': file.type || 'audio/mpeg',
      },
      body: audioBuffer,
      signal: AbortSignal.timeout(120_000), // Whisper can take longer on large files
    });

    if (!hfRes.ok) {
      const errText = await hfRes.text();
      if (hfRes.status === 503) {
        return NextResponse.json({ error: 'Whisper model is loading, please try again in 30 seconds.' }, { status: 503 });
      }
      return NextResponse.json({ error: `HF error: ${errText}` }, { status: hfRes.status });
    }

    const result = await hfRes.json();
    const transcript: string = result.text ?? result.transcription ?? '';

    return NextResponse.json({
      data: {
        transcript,
        filename: file.name,
        fileSizeKb: Math.round(file.size / 1024),
      },
    });
  } catch (err: any) {
    if (err.name === 'TimeoutError') {
      return NextResponse.json({ error: 'Transcription timed out. Try a shorter recording.' }, { status: 504 });
    }
    return NextResponse.json({ error: err.message ?? 'Speech-to-text failed' }, { status: 500 });
  }
}
