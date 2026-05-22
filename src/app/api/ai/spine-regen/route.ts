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

// Nigerian academic calendar context per national term
const NAT_TERM_CONTEXT: Record<number, { name: string; months: string; mood: string }> = {
  1: { name: 'First Term',  months: 'September–December', mood: 'new academic year, back-to-school energy, build foundations' },
  2: { name: 'Second Term', months: 'January–April',      mood: 'mid-year, settled class, deepen and apply knowledge' },
  3: { name: 'Third Term',  months: 'May–July',           mood: 'end of year, exam preparation, consolidation and showcase' },
};

// Grade-level context for appropriate complexity
const GRADE_CONTEXT: Record<string, string> = {
  basic_1: 'Primary 1 (age 6–7) — very simple concepts, short tasks, heavy visuals',
  basic_2: 'Primary 2 (age 7–8) — guided discovery, simple logic, playful',
  basic_3: 'Primary 3 (age 8–9) — structured projects, early problem solving',
  basic_4: 'Primary 4 (age 9–10) — procedural thinking, text-based coding begins',
  basic_5: 'Primary 5 (age 10–11) — algorithms, debugging, small projects',
  basic_6: 'Primary 6 (age 11–12) — program design, data handling, peer review',
  jss_1:   'JSS 1 (age 12–13) — logical thinking, web basics, version control intro',
  jss_2:   'JSS 2 (age 13–14) — full-stack awareness, APIs, collaborative builds',
  jss_3:   'JSS 3 (age 14–15) — exam-ready, capstone projects, system thinking',
  ss_1:    'SS 1 (age 15–16) — professional tools, portfolio, industry context',
  ss_2:    'SS 2 (age 16–17) — advanced specialisation, freelance/intern awareness',
  ss_3:    'SS 3 (age 17–18) — final year, job/uni readiness, showcase work',
};

async function callAI(prompt: string): Promise<string> {
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
    } catch { /* try next model */ }
  }
  return '';
}

function extractJSON(raw: string): unknown {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function buildContext(params: {
  laneLabel: string;
  courseName: string;
  programmeName: string;
  gradeLevel: string;
  academicYear: string;
  className: string;
  yearNumber: number;
  progTermNumber: number;     // programme term (1/2/3)
  nationalTermNumber: number; // national calendar term this prog term maps to
  programStartTerm: number;
  weakTopics: string[];
  skippedTopics: string[];
  existingTopics: string[];   // all topics already in this curriculum (other terms)
  prevTermTopics: string[];
  prevTopics: string[];       // already-generated weeks in current term
}): string {
  const nat = NAT_TERM_CONTEXT[params.nationalTermNumber] ?? NAT_TERM_CONTEXT[1];
  const gradeCtx = GRADE_CONTEXT[params.gradeLevel?.toLowerCase()] ?? params.gradeLevel;
  const progLabel = `Programme Term ${params.progTermNumber} of 3`;
  const calLabel = `${nat.name} (${nat.months})`;
  const pstNote = params.programStartTerm !== 1
    ? `Note: this school's programme begins in National ${NAT_TERM_CONTEXT[params.programStartTerm]?.name ?? `Term ${params.programStartTerm}`}.`
    : '';

  const lines: string[] = [
    '=== PROGRAMME & COURSE ===',
    params.programmeName ? `Programme: ${params.programmeName}` : '',
    params.courseName    ? `Course: ${params.courseName}` : '',
    `Skill Lane: ${params.laneLabel}`,
    gradeCtx             ? `Grade: ${gradeCtx}` : '',
    params.academicYear  ? `Academic Year: ${params.academicYear}` : '',
    '',
    '=== CALENDAR ===',
    `${progLabel} → ${calLabel}`,
    `Classroom mood: ${nat.mood}`,
    pstNote,
    '',
    '=== CLASS ===',
    `Class: ${params.className}`,
    `Programme Year: ${params.yearNumber} of 3`,
  ];

  if (params.weakTopics.length > 0)
    lines.push(`Known weak areas to reinforce: ${params.weakTopics.join(', ')}`);

  if (params.skippedTopics.length > 0)
    lines.push(`Previously skipped (weave back in): ${params.skippedTopics.join(', ')}`);

  if (params.existingTopics.length > 0) {
    lines.push('');
    lines.push('=== ALREADY IN THIS CURRICULUM (do NOT repeat) ===');
    lines.push(params.existingTopics.map((t, i) => `${i + 1}. ${t}`).join('\n'));
  }

  if (params.prevTermTopics.length > 0) {
    lines.push('');
    lines.push(`Previous term ending topics (for continuity): ${params.prevTermTopics.join(' → ')}`);
  }

  if (params.prevTopics.length > 0)
    lines.push(`Recent weeks this term: ${params.prevTopics.join(' → ')}`);

  return lines.filter(l => l !== '' || lines[lines.indexOf(l) - 1] !== '').join('\n');
}

/**
 * POST /api/ai/spine-regen
 *
 * Generates a personalised curriculum plan for a class.
 * - week_number supplied → single week (returns 1-item weeks array)
 * - otherwise → full term (12 weeks)
 *
 * Body: {
 *   lane_index: number
 *   year_number: number
 *   term_number: number              // programme term (1/2/3)
 *   national_term_number?: number    // national calendar term this prog term maps to
 *   week_number?: number
 *   class_name?: string
 *   course_name?: string
 *   programme_name?: string
 *   grade_level?: string
 *   academic_year?: string           // e.g. "2025/2026"
 *   program_start_term?: number
 *   weak_topics?: string[]
 *   skipped_topics?: string[]
 *   existing_curriculum_topics?: string[]  // all topics from other terms in this curriculum
 *   prev_term_topics?: string[]
 *   prev_topics?: string[]
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

  const laneIndex: number        = Number(body.lane_index ?? 1);
  const yearNumber: number       = Math.min(3, Math.max(1, Number(body.year_number ?? 1)));
  const termNumber: number       = Math.min(3, Math.max(1, Number(body.term_number ?? 1)));
  const nationalTermNumber: number = [1,2,3].includes(Number(body.national_term_number))
    ? Number(body.national_term_number) : termNumber;
  const weekNumber: number | null = body.week_number != null ? Number(body.week_number) : null;
  const className: string        = body.class_name || 'This class';
  const courseName: string       = body.course_name || '';
  const programmeName: string    = body.programme_name || '';
  const gradeLevel: string       = body.grade_level || '';
  const academicYear: string     = body.academic_year || '';
  const programStartTerm: number = [1,2,3].includes(Number(body.program_start_term))
    ? Number(body.program_start_term) : 1;

  const weakTopics: string[]             = Array.isArray(body.weak_topics) ? body.weak_topics.slice(0, 5) : [];
  const skippedTopics: string[]          = Array.isArray(body.skipped_topics) ? body.skipped_topics.slice(0, 5) : [];
  const prevTermTopics: string[]         = Array.isArray(body.prev_term_topics) ? body.prev_term_topics.slice(-3) : [];
  const prevTopics: string[]             = Array.isArray(body.prev_topics) ? body.prev_topics.slice(-4) : [];
  const existingTopics: string[]         = Array.isArray(body.existing_curriculum_topics)
    ? body.existing_curriculum_topics.slice(0, 50) : [];

  const laneLabel = LANE_LABELS[laneIndex] ?? `Lane ${laneIndex}`;
  const nat       = NAT_TERM_CONTEXT[nationalTermNumber] ?? NAT_TERM_CONTEXT[1];

  const ctx = buildContext({
    laneLabel, courseName, programmeName, gradeLevel, academicYear,
    className, yearNumber, progTermNumber: termNumber, nationalTermNumber,
    programStartTerm, weakTopics, skippedTopics, existingTopics, prevTermTopics, prevTopics,
  });

  let raw  = '';
  let weeks: Array<{ week: number; topic: string; subtopics: string[] }> = [];
  let note = '';

  if (weekNumber !== null) {
    // ── Single-week mode ──────────────────────────────────────────────────────
    const prompt = `You are a Nigerian STEM/coding curriculum expert. Generate ONE topic for a specific curriculum week.

${ctx}

Target: Programme Term ${termNumber} (${nat.name}), Week ${weekNumber} of 12, Year ${yearNumber}

RULES:
- Topic must be directly relevant to: ${laneLabel}${courseName ? ` / ${courseName}` : ''}
- 3–7 words, student-friendly, specific (NOT generic like "Introduction" or "Basics")
- Must NOT duplicate any topic listed in "ALREADY IN THIS CURRICULUM" above
- Subtopics: 3 specific hands-on concepts for this exact week
- Grade-appropriate for: ${gradeLevel || 'the class listed above'}

Return ONLY valid JSON — no markdown, no explanation:
{"topic": "concise 3-7 word topic", "subtopics": ["specific concept 1", "specific concept 2", "specific concept 3"]}`;

    raw = await callAI(prompt);
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
    const prompt = `You are a Nigerian STEM/coding curriculum expert. Generate a complete 12-week topic plan for one school term.

${ctx}

Term: Programme Term ${termNumber} → ${nat.name} (${nat.months}), Year ${yearNumber}

STRUCTURAL RULES:
- Week 1: Review/orientation — link to last term or introduce the skill lane for new starters
- Weeks 2–5: Core concept building — progressive complexity, each week builds on the last
- Weeks 6–8: Practical application — weave in any weak areas or skipped topics here
- Weeks 9–11: Advanced or project-based work — real-world context for ${nat.months}
- Week 12: Synthesis, review, assessment preparation
- Tone: ${nat.mood}
- Topics: 3–7 words each, student-friendly, specific, directly about ${laneLabel}${courseName ? ` / ${courseName}` : ''}
- NEVER duplicate a topic from "ALREADY IN THIS CURRICULUM" above
- Each of the 12 topics must be DISTINCT from each other

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
  "note": "One sentence: how this plan was personalised for this class and programme"
}`;

    raw = await callAI(prompt);
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

    // Fill any missing weeks up to 12 with labelled fallbacks
    const present = new Set(weeks.map(w => w.week));
    for (let w = 1; w <= 12; w++) {
      if (!present.has(w)) weeks.push({ week: w, topic: `Week ${w} — ${laneLabel}`, subtopics: [] });
    }
    weeks.sort((a, b) => a.week - b.week);
    note = typeof parsed.note === 'string' ? parsed.note.trim() : '';
  }

  return NextResponse.json({ weeks, note });
}
