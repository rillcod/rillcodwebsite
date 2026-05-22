import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { LANE_LABELS } from '@/lib/qa/resolveQaSpineLane';
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
});

// Ordered by structured-output reliability
const MODELS = [
  'google/gemini-2.0-flash-001',
  'deepseek/deepseek-chat-v3-5',
  'meta-llama/llama-3.3-70b-instruct',
];

async function generate(prompt: string): Promise<string> {
  for (const model of MODELS) {
    try {
      const res = await openai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.6,
        max_tokens: 1800,
      });
      const text = res.choices?.[0]?.message?.content?.trim() ?? '';
      if (text.length > 10) return text;
    } catch { /* try next */ }
  }
  return '';
}

function extractJSON(raw: string): unknown {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/**
 * POST /api/ai/spine-regen
 *
 * Generates a personalised curriculum plan for a class.
 * - If week_number is supplied → single week (returns 1-item weeks array)
 * - Otherwise → full term (12 weeks)
 *
 * Body: {
 *   lane_index: number
 *   year_number: number
 *   term_number: number
 *   week_number?: number          // single-week mode
 *   class_name?: string
 *   course_name?: string
 *   weak_topics?: string[]        // topic names that scored poorly
 *   skipped_topics?: string[]     // previously skipped curriculum topics
 *   prev_term_topics?: string[]   // last 3 weeks of previous term
 *   prev_topics?: string[]        // already-generated weeks this term (context)
 * }
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users').select('role').eq('id', user.id).single();
  if (!profile || !['admin', 'teacher'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const laneIndex: number = Number(body.lane_index ?? 1);
  const yearNumber: number = Math.min(3, Math.max(1, Number(body.year_number ?? 1)));
  const termNumber: number = Math.min(3, Math.max(1, Number(body.term_number ?? 1)));
  const weekNumber: number | null = body.week_number != null ? Number(body.week_number) : null;
  const className: string = body.class_name || 'This class';
  const courseName: string = body.course_name || '';
  const weakTopics: string[] = Array.isArray(body.weak_topics) ? body.weak_topics.slice(0, 5) : [];
  const skippedTopics: string[] = Array.isArray(body.skipped_topics) ? body.skipped_topics.slice(0, 5) : [];
  const prevTermTopics: string[] = Array.isArray(body.prev_term_topics) ? body.prev_term_topics.slice(-3) : [];
  const prevTopics: string[] = Array.isArray(body.prev_topics) ? body.prev_topics.slice(-4) : [];

  const laneLabel = LANE_LABELS[laneIndex] ?? `Lane ${laneIndex}`;
  const termName = termNumber === 1 ? 'First Term' : termNumber === 2 ? 'Second Term' : 'Third Term';

  const weakStr = weakTopics.length > 0
    ? `Known weak areas to reinforce: ${weakTopics.join(', ')}`
    : 'No specific weak areas identified.';
  const skippedStr = skippedTopics.length > 0
    ? `Previously skipped topics to weave back in: ${skippedTopics.join(', ')}`
    : '';
  const prevTermStr = prevTermTopics.length > 0
    ? `Last topics from previous term (for continuity): ${prevTermTopics.join(' → ')}`
    : '';
  const courseStr = courseName ? `Course: ${courseName}` : '';

  let raw = '';
  let weeks: Array<{ week: number; topic: string; subtopics: string[] }> = [];
  let note = '';

  if (weekNumber !== null) {
    // ── Single-week mode ─────────────────────────────────────────────────────
    const prevStr = prevTopics.length > 0
      ? `Recent weeks: ${prevTopics.join(' → ')}`
      : '';
    const prompt = `You are a Nigerian STEM/coding curriculum expert.
Generate ONE topic for a specific curriculum week.

Skill Lane: ${laneLabel}
Year ${yearNumber}, ${termName}, Week ${weekNumber} of 12
Class: ${className}
${courseStr}
${prevStr}
${weakStr}

Return ONLY valid JSON — no markdown, no explanation:
{"topic": "concise 3-7 word topic", "subtopics": ["specific concept 1", "specific concept 2", "specific concept 3"]}`;

    raw = await generate(prompt);
    const parsed = extractJSON(raw) as { topic?: string; subtopics?: string[] } | null;
    if (!parsed?.topic) {
      return NextResponse.json({ error: 'AI failed to generate a topic. Try again.' }, { status: 502 });
    }
    weeks = [{
      week: weekNumber,
      topic: String(parsed.topic).trim(),
      subtopics: Array.isArray(parsed.subtopics)
        ? parsed.subtopics.map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 4)
        : [],
    }];
    note = `Week ${weekNumber} regenerated for ${className}.`;

  } else {
    // ── Full-term mode (12 weeks) ─────────────────────────────────────────────
    const prompt = `You are a Nigerian STEM/coding curriculum expert.
Generate a complete personalised 12-week topic plan for one school term.

Skill Lane: ${laneLabel}
Year ${yearNumber}, ${termName}
Class: ${className}
${courseStr}
${weakStr}
${skippedStr}
${prevTermStr}

Structural rules:
- Week 1: Review/orientation (link to last term or introduce the lane)
- Weeks 2–5: Core concept building (progressive complexity)
- Weeks 6–8: Practical application — weave in any weak areas or skipped topics here
- Weeks 9–11: Advanced or project-based work
- Week 12: Synthesis, review, assessment preparation
- Topic names must be 3–7 words, student-friendly, specific (not generic like "Introduction")
- Each topic must be different and build on previous weeks

Return ONLY valid JSON with exactly 12 items — no markdown, no extra text:
{
  "weeks": [
    {"week": 1, "topic": "...", "subtopics": ["...", "...", "..."]},
    {"week": 2, "topic": "...", "subtopics": ["...", "...", "..."]},
    {"week": 3, "topic": "...", "subtopics": ["...", "...", "..."]},
    {"week": 4, "topic": "...", "subtopics": ["...", "...", "..."]},
    {"week": 5, "topic": "...", "subtopics": ["...", "...", "..."]},
    {"week": 6, "topic": "...", "subtopics": ["...", "...", "..."]},
    {"week": 7, "topic": "...", "subtopics": ["...", "...", "..."]},
    {"week": 8, "topic": "...", "subtopics": ["...", "...", "..."]},
    {"week": 9, "topic": "...", "subtopics": ["...", "...", "..."]},
    {"week": 10, "topic": "...", "subtopics": ["...", "...", "..."]},
    {"week": 11, "topic": "...", "subtopics": ["...", "...", "..."]},
    {"week": 12, "topic": "...", "subtopics": ["...", "...", "..."]}
  ],
  "note": "One sentence describing how this plan was personalised for the class"
}`;

    raw = await generate(prompt);
    const parsed = extractJSON(raw) as { weeks?: unknown[]; note?: string } | null;
    if (!parsed?.weeks || !Array.isArray(parsed.weeks) || parsed.weeks.length === 0) {
      return NextResponse.json({ error: 'AI failed to generate the term plan. Try again.' }, { status: 502 });
    }

    const rawWeeks = parsed.weeks as Array<{ week?: number; topic?: string; subtopics?: unknown[] }>;
    weeks = rawWeeks
      .filter(w => w.topic)
      .map((w, i) => ({
        week: typeof w.week === 'number' ? w.week : i + 1,
        topic: String(w.topic!).trim(),
        subtopics: Array.isArray(w.subtopics)
          ? w.subtopics.map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 4)
          : [],
      }))
      .slice(0, 12);

    // Fill any missing weeks up to 12 with generic fallbacks
    const present = new Set(weeks.map(w => w.week));
    for (let w = 1; w <= 12; w++) {
      if (!present.has(w)) {
        weeks.push({ week: w, topic: `Week ${w} — ${laneLabel}`, subtopics: [] });
      }
    }
    weeks.sort((a, b) => a.week - b.week);
    note = typeof parsed.note === 'string' ? parsed.note.trim() : '';
  }

  return NextResponse.json({ weeks, note });
}
