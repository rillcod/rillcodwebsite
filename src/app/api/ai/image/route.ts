import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Accept both simple { prompt } and rich { prompt, title, subject, gradeLevel }
    const { prompt, title, subject, gradeLevel } = body;

    // Build the best possible prompt
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
      return NextResponse.json({ error: 'Prompt or lesson details are required' }, { status: 400 });
    }

    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Hugging Face API key not configured' }, { status: 503 });
    }

    const model = 'black-forest-labs/FLUX.1-schnell';
    const enrichedPrompt = `Educational illustration for a classroom: ${finalPrompt}. High quality, clean style, STEM educational theme, white background where possible.`;

    const response = await fetch(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        method: 'POST',
        body: JSON.stringify({
          inputs: enrichedPrompt,
          parameters: {
            num_inference_steps: 4,
            guidance_scale: 3.5,
            width: 1024,
            height: 1024,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('HF Error:', response.status, errText);
      // Parse HuggingFace model loading error gracefully
      let userMsg = 'AI image generation failed';
      try {
        const errJson = JSON.parse(errText);
        if (errJson.error?.includes('loading')) {
          userMsg = 'Model is warming up — please try again in 20 seconds';
        } else if (errJson.error) {
          userMsg = errJson.error;
        }
      } catch {}
      return NextResponse.json({ error: userMsg }, { status: response.status });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64}`;

    // Return BOTH formats for compatibility with CanvaEditor (url) and LessonAITools (data.dataUrl)
    return NextResponse.json({
      url: dataUrl,
      data: { dataUrl, prompt: finalPrompt },
    });
  } catch (error: any) {
    console.error('AI Image Route Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
