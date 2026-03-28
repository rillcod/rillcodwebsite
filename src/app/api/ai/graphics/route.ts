import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
});

const MODELS = [
  "google/gemini-2.0-flash-001",              // Primary Stable (Fast)
  "x-ai/grok-2-1212",                         // Grok-2 (Wit & Logic)
  "moonshotai/kimi-k2.5",                     // Kimi K2.5 (User requested)
  "deepseek/deepseek-chat",                   // DeepSeek V3
  "qwen/qwen-2.5-coder-32b-instruct",         // Qwen Coder
  "google/gemini-2.0-flash-lite-preview-02-05", // User requested
  "google/gemini-2.0-flash-lite-001",                  // Reliable
  "meta-llama/llama-3.3-70b-instruct",        // High performance
  "mistralai/mistral-large-2411",             // Reasoning
  "meta-llama/llama-3.1-8b-instruct:free",    // Free fallback
  "mistralai/mistral-7b-instruct:free"        // Emergency fallback
];

export async function POST(req: NextRequest) {
  try {
    const { prompt, type } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const systemPrompt = `
      You are an AI Infographic Architect. Generate high-fidelity structural data for educational visuals.
      TYPES:
      1. 'flowchart': Generate Mermaid flowchart or diagram code. 
         Schema: { type: 'flowchart'|'sequence', code: string }
      2. 'illustration': A simple technical infographic with key points. 
         Schema: { title: string, items: { label: string, value: string }[] }
      3. 'code-map': A structural overview of code logic.
         Schema: { components: { name: string, description: string }[] }
      4. 'scratch-blocks': Generate a sequence of Scratch-style visual programming blocks.
         Schema: { blocks: string[], instructions: string }
      5. 'infographic': A structural mindmap or timeline for curriculum visualization.
         Types: 'mindmap', 'timeline', 'gantt', 'erDiagram'
         Schema: { type: 'mindmap'|'timeline'|'gantt'|'erDiagram', code: string }
         IMPORTANT TIMELINE SYNTAX:
         timeline
           title Title Here
           Section Name
             Event 1 : Description 1
             Event 2 : Description 2

      Return ONLY valid JSON.
    `;

    let lastError: any = null;
    
    // Task-Specific Prioritization: Grok-2 for Scratch Visuals
    let modelQueue = [...MODELS];
    if (type === 'scratch-blocks') {
      modelQueue = ["x-ai/grok-2-1212", ...MODELS.filter(m => m !== "x-ai/grok-2-1212")];
    }

    for (const model of modelQueue) {
      try {
        const response = await client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Generate a ${type || 'graphic'} for: ${prompt}` }
          ],
          response_format: { type: 'json_object' }
        });

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error('Empty response from ' + model);

        return NextResponse.json({
          success: true,
          data: JSON.parse(content),
          model
        });
      } catch (e: any) {
        console.warn(`Graphic generation failed for model ${model}:`, e.message);
        lastError = e;
        continue;
      }
    }

    throw lastError || new Error('All models failed to generate graphic');

  } catch (error: any) {
    console.error('AI Graphics Route Error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
