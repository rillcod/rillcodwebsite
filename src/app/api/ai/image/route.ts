import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, title, subject, gradeLevel } = body;

    let finalPrompt = prompt?.trim() || '';
    if (!finalPrompt) {
      const parts = [
        title ? `"${title}"` : 'a STEM lesson',
        subject ? `subject: ${subject}` : null,
        gradeLevel ? `grade level: ${gradeLevel}` : null,
      ].filter(Boolean);
      finalPrompt = parts.join(', ');
    }

    if (!finalPrompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const enrichedPrompt = `Educational illustration: ${finalPrompt}. Clean style, white background, classroom safe, high fidelity digital art.`;

    // Pollinations.ai — free, no API key, instant image generation
    const encoded = encodeURIComponent(enrichedPrompt);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encoded}?nologo=true&width=1024&height=1024&model=flux&seed=${Math.floor(Math.random() * 99999)}`;

    const response = await fetch(pollinationsUrl, {
      headers: { 'Accept': 'image/png,image/*' },
    });

    if (!response.ok) {
      console.error('Pollinations Image Error:', response.status, response.statusText);
      return NextResponse.json(
        { error: `Image generation failed (${response.status}). Try again.` },
        { status: 500 },
      );
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;

    return NextResponse.json({
      url: dataUrl,
      data: { url: dataUrl, prompt: finalPrompt },
    });

  } catch (error: any) {
    console.error('AI Image Route Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
