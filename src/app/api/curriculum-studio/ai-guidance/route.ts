import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requireGovernanceActor } from '@/lib/curriculum/governance-server';
import { academicVoiceInstruction, cleanAcademicVoice, voiceForRole } from '@/lib/ai/academicVoice';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
});

const MODELS = ['google/gemini-2.0-flash-001', 'deepseek/deepseek-chat-v3-5', 'meta-llama/llama-3.3-70b-instruct'];
const INTENTS = new Set(['quality_explanation', 'curriculum_improvement', 'lesson_delivery', 'school_timing']);

export async function POST(req: NextRequest) {
  const actor = await requireGovernanceActor();
  if (!actor) return NextResponse.json({ error: 'Staff access required.' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const intent = typeof body.intent === 'string' && INTENTS.has(body.intent) ? body.intent : '';
  const request = typeof body.request === 'string' ? body.request.trim().slice(0, 3000) : '';
  const context = body.context && typeof body.context === 'object' ? JSON.stringify(body.context).slice(0, 12000) : '{}';
  if (!intent || !request) return NextResponse.json({ error: 'Choose the help you need and describe the academic question.' }, { status: 400 });
  if (actor.role !== 'admin' && ['quality_explanation', 'curriculum_improvement'].includes(intent)) {
    return NextResponse.json({ error: 'Academic curriculum improvement is managed by the Academic Office. I can still help with lesson delivery or school timing.' }, { status: 403 });
  }
  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json({ error: 'Academic guidance is temporarily unavailable. The deterministic quality review remains available.' }, { status: 503 });
  }

  const voice = voiceForRole(actor.role, intent);
  const system = `${academicVoiceInstruction(voice)}
Intent: ${intent}.
Respect these boundaries: the official academic direction is read-only unless a human Academic Admin publishes a new edition; school timing is separate from curriculum content; teacher delivery ideas may change activities and examples but not official topics, sequence, grade, or learning outcomes.`;
  let answer = '';
  for (const model of MODELS) {
    try {
      const response = await client.chat.completions.create({
        model,
        temperature: 0.45,
        max_tokens: 700,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Academic context:\n${context}\n\nWhat the user needs:\n${request}` },
        ],
      });
      answer = cleanAcademicVoice(response.choices[0]?.message?.content ?? '');
      if (answer.length > 20) break;
    } catch { /* use the next approved provider */ }
  }
  if (!answer) return NextResponse.json({ error: 'I could not prepare useful academic guidance just now. Please try again.' }, { status: 502 });
  return NextResponse.json({ data: { voice, answer, authority: 'advisory_only' } });
}

