import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
});

export async function POST(req: NextRequest) {
  try {
    const { prompt, type } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const systemPrompt = `
      You are a Neural Graphic Synthesis Engine for Rillcod Technologies. 
      Generate structured JSON for educational visualizations.
      
      TYPES:
      1. 'd3-chart': Generate data for a D3 chart. 
         Schema: { chartType: 'bar'|'line'|'pie'|'area', dataset: number[], labels: string[] }
      2. 'motion-graphics': Generate config for Framer Motion animation.
         Schema: { animationType: 'orbit'|'pulse'|'flow'|'grid'|'particles', config: { nodes: number, speed: number, intensity: string } }
      3. 'infographic': A combination of text and metric data.
         Schema: { title: string, subtitle: string, items: { label: string, value: string, icon: string }[] }

      Return ONLY valid JSON.
    `;

    const response = await client.chat.completions.create({
      model: "google/gemini-2.0-flash-001",
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate a ${type || 'graphic'} for: ${prompt}` }
      ],
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Failed to generate graphic data');

    return NextResponse.json({
      success: true,
      data: JSON.parse(content)
    });

  } catch (error: any) {
    console.error('AI Graphics Route Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
