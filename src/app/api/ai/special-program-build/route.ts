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

const SYSTEM_PROMPT = `You are the curriculum designer for Rillcod Technologies (Benin City, Nigeria) — a Christian STEM academy for kids and teens.
Build a COMPLETE special-programme marketing + curriculum page as JSON only (no markdown fences).

Return this exact shape:
{
  "title": "Public programme title",
  "button_label": "Short homepage CTA (can start with an emoji)",
  "slug_hint": "url-safe-kebab-case",
  "season_badge": "Short badge e.g. Active Season: Summer 2026",
  "title_line1": "First hero line",
  "title_line2": "Highlighted second hero line",
  "hero_blurb": "1-2 sentence pitch for parents",
  "ages_label": "Ages 8+ · Kids, teens & adults",
  "age_min": 8,
  "age_max": 99,
  "duration_label": "N Weeks Cohort",
  "curriculum_heading": "Section heading",
  "curriculum_intro": "1-2 sentences about the curriculum approach",
  "tracks": [
    {
      "id": "snake_case_id",
      "icon": "single emoji",
      "week": "Module N · Weeks A–B",
      "title": "Module title",
      "desc": "1-2 sentence description",
      "topics": ["topic 1", "topic 2", "topic 3", "topic 4", "Project: ..."]
    }
  ],
  "weeks_heading": "Weekly Curriculum",
  "weeks_intro": "1 sentence about the weekly plan",
  "weeks": [
    {
      "num": "Week 1",
      "tag": "short tag",
      "title": "Week title",
      "desc": "1 sentence"
    }
  ],
  "bonus": {
    "enabled": true,
    "badge": "Included Free Bonus Track",
    "icon": "single emoji",
    "title": "Bonus module title",
    "desc": "1-2 sentences",
    "items": [
      { "label": "Skill name", "desc": "short description" },
      { "label": "Skill name", "desc": "short description" },
      { "label": "Skill name", "desc": "short description" }
    ]
  },
  "outcomes_heading": "Expected Outcomes",
  "outcomes_intro": "1 sentence about take-home results",
  "outcomes": [
    { "icon": "emoji", "title": "Outcome title", "desc": "short description" }
  ],
  "register_heading": "Registration Form",
  "next_path_heading": "After this cohort",
  "next_path_intro": "Kids, teens, adults, and individual learners are welcome. Continue into Young Innovators or Teen Developers, or specialist tracks for adults.",
  "suggested_online_fee": 50000,
  "suggested_onsite_fee": 100000,
  "suggested_deposit_percent": 50
}

Rules:
- British English. Practical, Nigeria-relevant examples (Lagos, Benin City, fintech, farming, schools).
- Christian-friendly tone without heavy preaching.
- tracks: 3–5 modules; weeks: match duration_weeks (default 6–8); outcomes: 4–6 items; bonus items: 3.
- Each module ends with a Project topic.
- Fees are NGN integers; keep suggestions realistic for Nigerian families unless the brief says otherwise.
- If mode is "online" lean lighter fees; if "onsite" higher; if "both" keep both suggestions.
- Output ONLY valid JSON.`;

type Scope = 'full' | 'hero' | 'tracks' | 'weeks' | 'bonus' | 'outcomes';

function buildUserPrompt(body: {
  brief: string;
  title?: string;
  duration_weeks?: number;
  age_min?: number;
  age_max?: number;
  mode?: string;
  scope?: Scope;
  existing?: Record<string, unknown>;
}) {
  const scope = body.scope || 'full';
  const parts = [
    `Brief / theme: ${body.brief}`,
    body.title ? `Working title: ${body.title}` : '',
    `Duration weeks: ${body.duration_weeks || 7}`,
    `Ages: ${body.age_min || 8}–${body.age_max || 99} (include adults/individuals when appropriate)`,
    `Delivery mode focus: ${body.mode || 'both'}`,
    `Generate scope: ${scope}`,
  ].filter(Boolean);

  if (scope !== 'full' && body.existing) {
    parts.push(`Existing page context (keep consistency, only regenerate the requested scope): ${JSON.stringify(body.existing).slice(0, 4000)}`);
  }

  if (scope === 'hero') {
    parts.push('Return JSON with only: season_badge, title_line1, title_line2, hero_blurb, curriculum_heading, curriculum_intro, ages_label, age_min, age_max, duration_label, button_label (optional), title (optional), register_heading (optional).');
  } else if (scope === 'tracks') {
    parts.push('Return JSON with only: tracks (full array), curriculum_heading (optional), curriculum_intro (optional).');
  } else if (scope === 'weeks') {
    parts.push('Return JSON with only: weeks (full array matching duration), weeks_heading, weeks_intro.');
  } else if (scope === 'bonus') {
    parts.push('Return JSON with only: bonus (full object with enabled, badge, icon, title, desc, items).');
  } else if (scope === 'outcomes') {
    parts.push('Return JSON with only: outcomes_heading, outcomes_intro, outcomes (full array).');
  }

  return parts.join('\n');
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('portal_users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || profile.role !== 'admin') return null;
  return user;
}

/** POST /api/ai/special-program-build — admin AI draft for special programme pages */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const brief = String(body.brief || body.prompt || '').trim();
  if (!brief) return NextResponse.json({ error: 'Describe the programme you want to build' }, { status: 400 });

  const userPrompt = buildUserPrompt({
    brief,
    title: body.title,
    duration_weeks: body.duration_weeks ? Number(body.duration_weeks) : 7,
    age_min: body.age_min ? Number(body.age_min) : 8,
    age_max: body.age_max ? Number(body.age_max) : 99,
    mode: body.mode,
    scope: body.scope,
    existing: body.existing,
  });

  const geminiResult = await geminiGenerateText(SYSTEM_PROMPT, userPrompt, true);
  if (geminiResult) {
    const data = parseJsonObject(geminiResult.text);
    if (data) {
      return NextResponse.json({ data, model: geminiResult.model, source: 'gemini' });
    }
  }

  const MODELS = [
    'google/gemini-2.5-flash',
    'deepseek/deepseek-chat-v3-5',
    'meta-llama/llama-3.3-70b-instruct',
    'qwen/qwen3-14b:free',
  ];

  for (const model of MODELS) {
    try {
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.65,
        max_tokens: 4000,
      });
      const raw = completion.choices[0]?.message?.content || '';
      const data = parseJsonObject(raw);
      if (data) return NextResponse.json({ data, model, source: 'openrouter' });
    } catch {
      continue;
    }
  }

  return NextResponse.json({ error: 'AI generation failed — try again or build manually' }, { status: 502 });
}
