import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { geminiGenerateText } from '@/lib/gemini/client';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://rillcod.com',
    'X-Title': 'Rillcod Technologies',
  },
});

const SYSTEM_PROMPT = `You are an expert STEM/coding educator creating project activities for Nigerian secondary school students (JSS1–SS3).
Given a brief description, generate a complete project activity as JSON.

Return ONLY valid JSON with this exact structure:
{
  "title": "Concise activity title (max 60 chars)",
  "description": "1-2 sentence summary visible in the activity list",
  "instructions": "Full student-facing instructions. Use numbered steps, include requirements and deliverables sections.",
  "category": one of: "coding" | "web" | "ai" | "design" | "research" | "hardware" | "presentation",
  "difficulty": one of: "beginner" | "intermediate" | "advanced",
  "tags": ["tag1", "tag2", "tag3"] (3-6 relevant lowercase tags),
  "submission_types": array of one or more: "link" | "code" | "file" | "screenshot" | "text"
}

Rules:
- Instructions should be detailed, structured, and encouraging. British English.
- Tags should be specific: programming language, topic, tool (e.g. "python", "html", "arduino", "scratch")
- Pick submission_types that match the project (link for websites, code for coding tasks, file for documents)
- Keep difficulty appropriate for Nigerian secondary school context`;

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const prompt = (body.prompt || '').trim();
  if (!prompt) return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });

  // ── 1. Try Gemini first (free tier) ────────────────────────────────────────
  const geminiResult = await geminiGenerateText(
    SYSTEM_PROMPT,
    `Create a project activity for: ${prompt}`,
    true,
  );
  if (geminiResult) {
    try {
      const jsonMatch = geminiResult.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        return NextResponse.json({ data, model: geminiResult.model, source: 'gemini' });
      }
    } catch {}
  }

  // ── 2. OpenRouter fallback ──────────────────────────────────────────────────
  const MODELS = [
    'google/gemini-2.5-flash',
    'deepseek/deepseek-chat-v3-5',
    'meta-llama/llama-3.3-70b-instruct',
    'qwen/qwen3-14b:free',
    'mistralai/mistral-7b-instruct:free',
  ];

  for (const model of MODELS) {
    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Create a project activity for: ${prompt}` },
        ],
        temperature: 0.7,
        max_tokens: 1200,
      });

      const raw = completion.choices[0]?.message?.content || '';
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;

      const data = JSON.parse(jsonMatch[0]);
      return NextResponse.json({ data, model, source: 'openrouter' });
    } catch {
      continue;
    }
  }

  return NextResponse.json({ error: 'AI generation failed — please try again' }, { status: 500 });
}
