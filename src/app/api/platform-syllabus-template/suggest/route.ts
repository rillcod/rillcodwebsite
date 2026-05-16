import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { LANE_LABELS } from '@/lib/qa/resolveQaSpineLane';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
});

const TERM_NAME: Record<number, string> = { 1: 'First Term', 2: 'Second Term', 3: 'Third Term' };

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || !['admin', 'teacher'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { program_id, lane_index, year_number = 1, term_number = 1, week_number = 1 } = body;

  if (!program_id || !lane_index) {
    return NextResponse.json({ error: 'program_id and lane_index are required' }, { status: 400 });
  }

  // Fetch program name
  const { data: prog } = await supabase
    .from('programs')
    .select('name')
    .eq('id', program_id)
    .maybeSingle();

  const laneName = LANE_LABELS[Number(lane_index)] ?? `Lane ${lane_index}`;
  const termName = TERM_NAME[Number(term_number)] ?? 'First Term';

  const prompt = `You are a Nigerian STEM/coding curriculum expert. Generate a single week topic for a coding programme.

Context:
- Programme: ${prog?.name ?? program_id}
- Skill lane: ${laneName}
- Programme Year: ${year_number} of 3
- Term: ${termName}
- Week: ${week_number} of 12

Return ONLY valid JSON — no markdown, no explanation:
{
  "topic": "Short descriptive week topic (max 8 words)",
  "subtopics": ["Subtopic 1", "Subtopic 2", "Subtopic 3", "Subtopic 4"]
}

Requirements:
- Topic should build naturally on the progression for Year ${year_number}, ${termName}, Week ${week_number}
- Subtopics should be concrete, teachable concepts for that week
- Align with Nigerian coding education standards
- Use clear, student-friendly language`;

  const models = [
    'google/gemini-2.0-flash-001',
    'deepseek/deepseek-chat-v3-5',
    'meta-llama/llama-3.3-70b-instruct',
  ];

  for (const model of models) {
    try {
      const res = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 300,
      });
      const raw = res.choices?.[0]?.message?.content ?? '';
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;
      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed.topic) continue;
      return NextResponse.json({
        topic: String(parsed.topic).trim(),
        subtopics: Array.isArray(parsed.subtopics)
          ? parsed.subtopics.map((s: unknown) => String(s).trim()).filter(Boolean)
          : [],
      });
    } catch {
      // try next model
    }
  }

  return NextResponse.json({ error: 'AI suggestion failed — all models unavailable' }, { status: 502 });
}
