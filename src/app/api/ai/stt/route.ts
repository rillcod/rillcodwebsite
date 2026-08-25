import { NextRequest, NextResponse } from 'next/server';
import { withApiProxy } from '@/lib/api-wrapper';
import { hasHuggingFaceKey, huggingFaceTranscribe } from '@/lib/ai/huggingface';
import { CF_WHISPER_MODEL, cloudflareTranscribe, hasCloudflareAi } from '@/lib/ai/cloudflare-ai';


async function postHandler(req: NextRequest) {
  try {
    // Either provider can do the job, so the route is configured if it has one.
    // The old guard checked HUGGINGFACE_API_KEY and then spent the OpenRouter
    // one, which meant it 503-ed with an HF key absent and ran on to a broken
    // call with an HF key present but no OpenRouter key.
    if (!process.env.OPENROUTER_API_KEY && !hasHuggingFaceKey() && !hasCloudflareAi()) {
      return NextResponse.json({ error: 'Speech-to-text is not configured.' }, { status: 503 });
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

    // Real Whisper first, cheapest provider first. The OpenRouter path at the
    // bottom base64s the clip into an `image_url` field and asks a text model to
    // "transcribe this audio" — it works by accident of multimodal tolerance,
    // not because it is the right call.
    //
    // Cloudflare leads because Whisper there runs on the free daily Neuron
    // allocation, where Hugging Face bills per second of audio. Each helper
    // returns null rather than throwing, so an outage moves down the list
    // instead of failing the request.
    const providers: Array<{ name: string; model: string; run: () => Promise<string | null> }> = [
      {
        name: 'cloudflare',
        model: CF_WHISPER_MODEL,
        run: () => cloudflareTranscribe(audioBuffer),
      },
      {
        name: 'huggingface',
        model: 'openai/whisper-large-v3',
        run: () => huggingFaceTranscribe(audioBuffer, file.type || 'audio/mpeg'),
      },
    ];

    for (const provider of providers) {
      const transcript = await provider.run();
      if (transcript) {
        return NextResponse.json({
          text: transcript,
          data: {
            transcript,
            filename: file.name,
            fileSizeKb: Math.round(file.size / 1024),
            model: provider.model,
            provider: provider.name,
          },
        });
      }
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: 'Transcription is temporarily unavailable. Please try again.' },
        { status: 503 },
      );
    }

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

// Lesson-authoring tool: same surface as the lesson editor that calls it.
// withApiProxy supplies auth, the role gate, the write-burst limit and the
// browser-origin check in one place, so this route cannot drift open again.
export const POST = (req: any, ctx: any) =>
  withApiProxy(postHandler, {
    requireAuth: true,
    requireTenant: false,
    roles: ['admin', 'teacher'],
  })(req, ctx);
