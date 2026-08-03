import { NextRequest, NextResponse } from 'next/server';


export async function POST(req: NextRequest) {
  try {
    if (!process.env.HUGGINGFACE_API_KEY) {
      return NextResponse.json({ error: 'Hugging Face API key not configured.' }, { status: 503 });
    }

    const formData = await req.formData();
    const file = (formData.get('audio') || formData.get('file')) as File | null;

    if (!file) {
      return NextResponse.json({ error: 'audio file is required' }, { status: 400 });
    }

    // Whisper accepts audio up to ~25MB
    const MAX_BYTES = 25 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large. Max 25 MB.' }, { status: 413 });
    }

    const audioBuffer = await file.arrayBuffer();

    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://rillcod.com'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Please transcribe this audio recording accurately.' },
              { type: 'image_url', url: `data:${file.type || 'audio/mpeg'};base64,${audioBase64}` }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        console.error('OpenRouter STT Error:', response.status, errData);
        return NextResponse.json({ error: `Transcription failed: ${errData.error?.message || response.statusText}` }, { status: response.status });
    }

    const result = await response.json();
    const transcript = result.choices[0]?.message?.content || '';

    return NextResponse.json({
      text: transcript,
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
