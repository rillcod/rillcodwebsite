import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Hugging Face API key not configured' }, { status: 503 });
    }

    // Using ModelScope Text-to-Video (standard on HF)
    const MODEL = 'damo-vilab/modelscope-damo-text-to-video';
    
    console.log('Generating AI Video for prompt:', prompt);

    const response = await fetch(
      `https://api-inference.huggingface.co/models/${MODEL}`,
      {
        headers: { 
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        method: 'POST',
        body: JSON.stringify({ inputs: prompt }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('HF Video Error:', response.status, errText);
      let userMsg = 'AI video generation failed';
      try {
        const errJson = JSON.parse(errText);
        if (errJson.error?.includes('loading')) {
          userMsg = 'Video model is warming up — please try again in 1-2 minutes. (AI Video takes significant compute)';
        } else if (errJson.error) {
          userMsg = errJson.error;
        }
      } catch {}
      return NextResponse.json({ error: userMsg }, { status: response.status });
    }

    // HF Inference API usually returns the video as a binary stream
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    const dataUrl = `data:video/mp4;base64,${base64}`;

    return NextResponse.json({
      success: true,
      data: {
        url: dataUrl,
        prompt: prompt
      }
    });
  } catch (error: any) {
    console.error('AI Video Route Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
