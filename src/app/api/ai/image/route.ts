import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    if (!prompt) return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });

    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Hugging Face API key not configured' }, { status: 503 });
    }

    // Using a reliable model for educational illustrations
    const model = "black-forest-labs/FLUX.1-schnell"; // Fast and high quality

    const response = await fetch(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        method: "POST",
        body: JSON.stringify({
          inputs: `Educational illustration for a classroom: ${prompt}. High quality, clean style, STEM educational theme, white background where possible.`,
          parameters: { num_inference_steps: 4 }
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error('HF Error:', err);
      return NextResponse.json({ error: 'Failed to generate image from AI' }, { status: response.status });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');

    return NextResponse.json({
      url: `data:image/jpeg;base64,${base64}`
    });

  } catch (error: any) {
    console.error('AI Image Route Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
