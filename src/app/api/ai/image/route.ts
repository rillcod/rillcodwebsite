import { NextRequest, NextResponse } from 'next/server';

const HF_API = 'https://api-inference.huggingface.co/models';
const MODEL = 'black-forest-labs/FLUX.1-schnell';

export async function POST(req: NextRequest) {
  try {
    if (!process.env.HUGGINGFACE_API_KEY) {
      return NextResponse.json({ error: 'Hugging Face API key not configured.' }, { status: 503 });
    }

    const { prompt, title, subject, gradeLevel } = await req.json();

    if (!prompt && !title) {
      return NextResponse.json({ error: 'prompt or title is required' }, { status: 400 });
    }

    // Build an educational, child-safe image prompt
    const imagePrompt = prompt ?? [
      `Educational illustration for a STEM lesson about "${title}"`,
      subject ? `subject: ${subject}` : '',
      gradeLevel ? `for ${gradeLevel} students` : '',
      'colorful, engaging, digital art style, clean background, school learning theme, no text',
    ].filter(Boolean).join(', ');

    const hfRes = await fetch(`${HF_API}/${MODEL}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: imagePrompt }),
      // HF can be slow on cold start — allow up to 60s
      signal: AbortSignal.timeout(60_000),
    });

    if (!hfRes.ok) {
      const errText = await hfRes.text();
      // Model may still be loading — surface friendly message
      if (hfRes.status === 503) {
        return NextResponse.json({ error: 'Model is loading, please try again in 20 seconds.' }, { status: 503 });
      }
      return NextResponse.json({ error: `HF error: ${errText}` }, { status: hfRes.status });
    }

    const imageBuffer = await hfRes.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString('base64');
    const contentType = hfRes.headers.get('content-type') ?? 'image/jpeg';

    return NextResponse.json({
      data: {
        base64,
        dataUrl: `data:${contentType};base64,${base64}`,
        contentType,
        prompt: imagePrompt,
      },
    });
  } catch (err: any) {
    if (err.name === 'TimeoutError') {
      return NextResponse.json({ error: 'Image generation timed out. Try again.' }, { status: 504 });
    }
    return NextResponse.json({ error: err.message ?? 'Image generation failed' }, { status: 500 });
  }
}
