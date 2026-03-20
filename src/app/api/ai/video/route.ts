import { NextRequest, NextResponse } from 'next/server';

// AI video generation APIs do not offer a free/reliable public endpoint.
// Instead, we use OpenRouter to find the best YouTube educational video for the topic,
// which the lesson page embeds via ReactPlayer.
export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI service not configured.' }, { status: 503 });
    }

    // Ask AI to suggest the best YouTube educational video URL for the topic
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://rillcod.com',
        'X-Title': 'Rillcod Technologies',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [
          {
            role: 'user',
            content: `You are a STEM education video curator for Nigerian students.
Find the single best YouTube educational video URL for this topic: "${prompt}".
The video must be:
- Educational and kid-friendly (suitable for Basic 1 to SS3)
- From a reputable channel (Khan Academy, CrashCourse, Code.org, TED-Ed, FreeCodeCamp, etc.)
- Available on YouTube (real, non-fictional URL)

Return ONLY a JSON object with this exact shape:
{
  "url": "https://www.youtube.com/watch?v=REAL_VIDEO_ID",
  "title": "Video title",
  "channel": "Channel name"
}

Return nothing else. Only real, known YouTube video URLs.`,
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 200,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: `Video suggestion failed: ${err.error?.message || response.statusText}` },
        { status: 500 },
      );
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '{}';

    let parsed: { url?: string; title?: string; channel?: string } = {};
    try {
      const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      parsed = JSON.parse(stripped);
    } catch {
      return NextResponse.json({ error: 'Could not parse video suggestion.' }, { status: 500 });
    }

    if (!parsed.url || !parsed.url.includes('youtube.com')) {
      return NextResponse.json({ error: 'No suitable educational video found. Try a more specific topic.' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        url: parsed.url,
        title: parsed.title || prompt,
        channel: parsed.channel || 'YouTube',
        prompt,
      },
    });

  } catch (error: any) {
    console.error('AI Video Route Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
