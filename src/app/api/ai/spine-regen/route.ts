import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { LANE_LABELS } from '@/lib/qa/resolveQaSpineLane';
import OpenAI from 'openai';
import { modelQueueFor } from '@/lib/ai/model-policy';
import { geminiGenerateText } from '@/lib/gemini/client';

// AI generation is slow on long context (big prompt + dedup retries + model
// fallback). On a serverless host this would be killed at the ~60s default and
// surface in the browser as a generic "network error". Per-week calls stay well
// under 300s; this is the safety net. Inert on Cloudflare Containers — the Node
// server behind the Worker gateway has no per-route cap — but kept as intent.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  // Bound each model call so a slow/hung model fails fast to the next instead of
  // eating the whole request budget. maxRetries:0 stops the SDK's built-in
  // exponential-backoff retries from silently multiplying latency per model.
  timeout: 30_000,
  maxRetries: 0,
});

const MODELS = [
  'google/gemini-2.5-flash',
  'google/gemini-2.5-pro',
  'deepseek/deepseek-r1:free',
  'deepseek/deepseek-chat',
  'google/gemini-2.0-flash-001',
  'meta-llama/llama-3.3-70b-instruct',
];

// Nigerian academic calendar — national term context
const NAT_TERM_CONTEXT: Record<number, { name: string; months: string; mood: string }> = {
  1: { name: 'First Term',  months: 'September–December', mood: 'new academic year, build foundations, high motivation' },
  2: { name: 'Second Term', months: 'January–April',      mood: 'settled class, deepen and apply, steady momentum' },
  3: { name: 'Third Term',  months: 'May–July',           mood: 'end of year, exam prep, consolidate and showcase projects' },
};

// Grade level descriptors
const GRADE_CONTEXT: Record<string, string> = {
  basic_1: 'Primary 1 (age 6–7): very simple, visual, 5-minute tasks',
  basic_2: 'Primary 2 (age 7–8): guided discovery, simple logic, playful',
  basic_3: 'Primary 3 (age 8–9): structured mini-projects, early problem solving',
  basic_4: 'Primary 4 (age 9–10): procedural thinking, text coding begins',
  basic_5: 'Primary 5 (age 10–11): algorithms, debugging, small complete projects',
  basic_6: 'Primary 6 (age 11–12): program design, data handling, peer review',
  jss_1:   'JSS 1 (age 12–13): logical thinking, web basics, version control intro',
  jss_2:   'JSS 2 (age 13–14): full-stack awareness, APIs, collaborative builds',
  jss_3:   'JSS 3 (age 14–15): exam-ready, WAEC/NECO alignment, capstone projects',
  ss_1:    'SS 1 (age 15–16): professional tools, portfolio building, industry context',
  ss_2:    'SS 2 (age 16–17): advanced specialisation, freelance/intern awareness',
  ss_3:    'SS 3 (age 17–18): final year, job/uni readiness, showcase-quality work',
};

// Technology track labels from qa_track_hint
const TRACK_LABELS: Record<string, string> = {
  python:           'Python programming (scripts, data structures, functions, OOP)',
  html_css:         'HTML/CSS/JavaScript web development (UI, DOM, responsive design)',
  young_innovator:  'ScratchJr & Scratch 3.0 visual programming (sprite motion, costumes/backdrops, events, broadcast messaging, variables, scorekeeping, cloning, collision sensing, custom blocks, and interactive game projects)',
  jss_web_app:      'Full-stack web application development (React, Node.js, databases)',
  ui_ux_design:     'UI/UX Design (Figma, Adobe XD, user research, prototyping)',
  mobile_development: 'Mobile app development (Dart, Flutter, Capacitor)',
};

// Year-arc: what each programme year focuses on
const YEAR_ARC: Record<number, string> = {
  1: 'Year 1 — Foundations: introduce concepts, build confidence, guided exploration',
  2: 'Year 2 — Application: deepen skills, real-world projects, independent problem-solving',
  3: 'Year 3 — Mastery: advanced techniques, portfolio-ready builds, industry-standard practices',
};

async function callAI(prompt: string, temperature = 0.65): Promise<string> {
  // Direct Google Gemini API priority path — saves 100% of OpenRouter tokens
  if (process.env.GEMINI_API_KEY) {
    const SYSTEM_PROMPT = "You are a Nigerian STEM/coding curriculum expert for Rillcod Technologies, a Christian STEM innovation academy. Ground technical topics and subtopics in Biblical story analogies (Noah's Ark, Joshua's Jericho, Moses' rod, David vs Goliath, Nehemiah's wall building) and African local tech context.";
    const geminiResult = await geminiGenerateText(SYSTEM_PROMPT, prompt, true).catch(() => null);
    if (geminiResult?.text) {
      return geminiResult.text.trim();
    }
  }

  // Preferences resolved by the one policy: retired ids dropped, free and
  // healthy models first.
  const queue = await modelQueueFor({ prefer: MODELS, needsJson: true });
  for (const model of queue) {
    try {
      const res = await openai.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
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

// Simple semantic similarity: word overlap on meaningful words (>4 chars)
function semanticOverlap(a: string, b: string): number {
  const words = (s: string) => new Set(s.toLowerCase().split(/\W+/).filter(w => w.length > 4));
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  const overlap = [...wa].filter(w => wb.has(w)).length;
  return overlap / Math.min(wa.size, wb.size);
}

function isTooSimilar(topic: string, existing: string[]): string | null {
  for (const e of existing) {
    if (semanticOverlap(topic, e) > 0.55) return e;
  }
  return null;
}

type ContentFootprint = {
  week_coverage?: { prog_term: number; week: number; topic: string; objectives?: string[]; assignment_title?: string; project_title?: string }[];
  assignment_titles?: string[];
  flashcard_deck_titles?: string[];
  lesson_titles?: string[];
};

function buildContext(p: {
  laneLabel: string; trackLabel: string; courseName: string; programmeName: string;
  gradeLevel: string; academicYear: string; className: string;
  yearNumber: number; progTermNumber: number; nationalTermNumber: number;
  programStartTerm: number; weakTopics: string[]; skippedTopics: string[];
  existingTopics: string[]; prevTermTopics: string[]; prevTopics: string[];
  contentFootprint?: ContentFootprint;
}): string {
  const nat = NAT_TERM_CONTEXT[p.nationalTermNumber] ?? NAT_TERM_CONTEXT[1];
  const gradeCtx = GRADE_CONTEXT[p.gradeLevel?.toLowerCase()] ?? (p.gradeLevel || '');
  const trackCtx = p.trackLabel || p.laneLabel;
  const yearArc = YEAR_ARC[p.yearNumber] ?? YEAR_ARC[1];
  const pstNote = p.programStartTerm !== 1
    ? `School programme begins in National ${NAT_TERM_CONTEXT[p.programStartTerm]?.name ?? `Term ${p.programStartTerm}`}.`
    : '';

  const lines: string[] = [
    '=== PROGRAMME & COURSE ===',
    p.programmeName  ? `Programme: ${p.programmeName}` : '',
    p.courseName     ? `Course: ${p.courseName}` : '',
    `Technology Track: ${trackCtx}`,
    `Skill Lane: ${p.laneLabel}`,
    gradeCtx         ? `Grade: ${gradeCtx}` : '',
    p.academicYear   ? `Academic Year: ${p.academicYear}` : '',
    '',
    '=== LEARNING ARC ===',
    yearArc,
    `Programme Year ${p.yearNumber} of 3, Programme Term ${p.progTermNumber} of 3`,
    '',
    '=== CALENDAR ===',
    `${nat.name} (${nat.months}) — ${nat.mood}`,
    pstNote,
    '',
    '=== CLASS ===',
    `Class: ${p.className}`,
  ];

  if (p.weakTopics.length > 0)
    lines.push(`Weak areas to reinforce: ${p.weakTopics.join(', ')}`);
  if (p.skippedTopics.length > 0)
    lines.push(`Skipped topics to weave back in: ${p.skippedTopics.join(', ')}`);
  if (p.prevTermTopics.length > 0)
    lines.push(`\nPrevious term ending topics (build from here): ${p.prevTermTopics.join(' → ')}`);
  if (p.prevTopics.length > 0)
    lines.push(`Recent weeks this term: ${p.prevTopics.join(' → ')}`);

  // Content pipeline footprint — the most powerful anti-repetition context
  const fp = p.contentFootprint;
  if (fp) {
    const hasCoverage = fp.week_coverage?.length;
    const hasAssign   = fp.assignment_titles?.length;
    const hasFlash    = fp.flashcard_deck_titles?.length;
    const hasLessons  = fp.lesson_titles?.length;

    if (hasCoverage || hasAssign || hasFlash || hasLessons) {
      lines.push('', '=== CONTENT PIPELINE ALREADY BUILT (do NOT duplicate — build NEXT STEPS from these) ===');

      if (hasCoverage) {
        lines.push('Weeks with full lesson plans:');
        for (const w of fp.week_coverage!.slice(0, 24)) {
          let row = `  Prog.T${w.prog_term} W${w.week}: "${w.topic}"`;
          if (w.assignment_title) row += ` → Assignment: "${w.assignment_title}"`;
          if (w.project_title)    row += ` → Project: "${w.project_title}"`;
          if (w.objectives?.length) row += ` | Objectives: ${w.objectives.slice(0, 2).join('; ')}`;
          lines.push(row);
        }
      }
      if (hasAssign) {
        lines.push(`Assignments already in use (titles must NOT be reused or closely echoed):`);
        lines.push(`  ${fp.assignment_titles!.slice(0, 20).map(t => `"${t}"`).join(', ')}`);
      }
      if (hasFlash) {
        lines.push(`Flashcard decks already created (topics deeply covered):`);
        lines.push(`  ${fp.flashcard_deck_titles!.map(t => `"${t}"`).join(', ')}`);
      }
      if (hasLessons) {
        lines.push(`Lessons already taught:`);
        lines.push(`  ${fp.lesson_titles!.slice(0, 20).map(t => `"${t}"`).join(', ')}`);
      }
      lines.push('→ Generate topics that are NATURAL NEXT STEPS beyond all of the above, not re-covers.');
    }
  }

  if (p.existingTopics.length > 0) {
    lines.push('', '=== CURRICULUM TOPICS FROM OTHER TERMS (do NOT repeat) ===');
    lines.push(p.existingTopics.map((t, i) => `${i + 1}. ${t}`).join('\n'));
  }

  return lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n');
}

/**
 * POST /api/ai/spine-regen
 *
 * Body: {
 *   lane_index, year_number, term_number, national_term_number?,
 *   week_number?,         // single-week mode
 *   class_name?, course_name?, programme_name?,
 *   qa_track_hint?,       // 'python' | 'html_css' | 'young_innovator' | …
 *   grade_level?,         // 'basic_1' … 'ss_3'
 *   academic_year?,       // '2025/2026'
 *   program_start_term?,
 *   weak_topics?,
 *   skipped_topics?,
 *   existing_curriculum_topics?,   // all topics from other terms — avoid repeating
 *   prev_term_topics?,
 *   prev_topics?,
 *   locked_weeks?,        // week numbers to skip (already completed)
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

  const laneIndex          = Number(body.lane_index ?? 1);
  const yearNumber         = Math.min(3, Math.max(1, Number(body.year_number ?? 1)));
  const termNumber         = Math.min(3, Math.max(1, Number(body.term_number ?? 1)));
  const nationalTermNumber = [1,2,3].includes(Number(body.national_term_number))
    ? Number(body.national_term_number) : termNumber;
  const weekNumber: number | null = body.week_number != null ? Number(body.week_number) : null;

  const className       = body.class_name     || 'This class';
  const courseName      = body.course_name    || '';
  const programmeName   = body.programme_name || '';
  const qaTrackHint     = String(body.qa_track_hint || '').toLowerCase().replace(/[\s/]/g, '_');
  const gradeLevel      = String(body.grade_level || '').toLowerCase();
  const academicYear    = body.academic_year  || '';
  const programStartTerm = [1,2,3].includes(Number(body.program_start_term))
    ? Number(body.program_start_term) : 1;

  const weakTopics:     string[] = Array.isArray(body.weak_topics)     ? body.weak_topics.slice(0, 5) : [];
  const skippedTopics:  string[] = Array.isArray(body.skipped_topics)  ? body.skipped_topics.slice(0, 5) : [];
  const prevTermTopics: string[] = Array.isArray(body.prev_term_topics)? body.prev_term_topics.slice(-3) : [];
  const prevTopics:     string[] = Array.isArray(body.prev_topics)     ? body.prev_topics.slice(-4) : [];
  const existingTopics: string[] = Array.isArray(body.existing_curriculum_topics)
    ? body.existing_curriculum_topics.slice(0, 60) : [];
  const lockedWeeks: number[]    = Array.isArray(body.locked_weeks)
    ? body.locked_weeks.map(Number) : [];
  const contentFootprint: ContentFootprint | undefined =
    body.content_footprint && typeof body.content_footprint === 'object'
      ? body.content_footprint as ContentFootprint : undefined;

  const laneLabel  = LANE_LABELS[laneIndex] ?? `Lane ${laneIndex}`;
  const trackLabel = TRACK_LABELS[qaTrackHint] || TRACK_LABELS[gradeLevel] || '';
  const nat        = NAT_TERM_CONTEXT[nationalTermNumber] ?? NAT_TERM_CONTEXT[1];

  // Merge footprint's existing topics into the dedup check list
  const footprintTopics = contentFootprint?.week_coverage?.map(w => w.topic).filter(Boolean) ?? [];
  const allExistingForDedup = [...existingTopics, ...footprintTopics];

  const ctx = buildContext({
    laneLabel, trackLabel, courseName, programmeName, gradeLevel, academicYear,
    className, yearNumber, progTermNumber: termNumber, nationalTermNumber,
    programStartTerm, weakTopics, skippedTopics, existingTopics, prevTermTopics, prevTopics,
    contentFootprint,
  });

  const subTopicInstruction = `Subtopics must be CONCRETE CLASSROOM ACTIVITIES students will DO, not abstract concepts.
  Example good: "Write a Python function that calculates BMI", "Design a login form in HTML"
  Example bad: "Functions", "HTML forms"`;

  let raw  = '';
  let weeks: Array<{ week: number; topic: string; subtopics: string[] }> = [];
  let note = '';

  // ── Helper: single-week AI call with retry on semantic duplicate ─────────
  async function generateWeek(wNum: number, localPrevTopics: string[]): Promise<{ topic: string; subtopics: string[] } | null> {
    const allExisting = [...allExistingForDedup, ...localPrevTopics];
    const avoidStr = allExisting.length > 0
      ? `\nStrictly avoid topics similar to: ${allExisting.slice(-8).join(' | ')}`
      : '';

    const prompt = `You are a Nigerian STEM/coding curriculum expert for Rillcod Technologies, a Christian STEM innovation academy. Generate ONE topic for a specific curriculum week.

${ctx}

Target: Programme Term ${termNumber} (${nat.name}), Week ${wNum} of 12, Year ${yearNumber}
${avoidStr}

RULES:
- Topic: 3–7 words, student-friendly, specific to ${trackLabel || laneLabel}${courseName ? ` / ${courseName}` : ''}. Blend technical goals with Christian/Biblical story analogies (e.g. "Looping: Marching Around Jericho", "Data Lists: Noah's Ark Inventory", "Variables: Changing States of Moses' Rod", "Functions: Rebuilding Nehemiah's Wall").
- Must NOT duplicate or paraphrase any topic in "ALREADY COVERED" above or in the avoid list
- Grade-appropriate for: ${GRADE_CONTEXT[gradeLevel] || gradeLevel || className}
- ${subTopicInstruction}. Ground student activities in Biblical metaphors and local African/Nigerian tech scenarios (OPay USSD, Kano solar farming, Lagos BRT). Use local names like Chioma, Kofi, Tunde, Musa.

Return ONLY valid JSON:
{"topic": "3-7 word specific topic", "subtopics": ["activity 1", "activity 2", "activity 3"]}`;

    for (let attempt = 0; attempt < 3; attempt++) {
      raw = await callAI(prompt, 0.6 + attempt * 0.1);
      const parsed = extractJSON(raw) as { topic?: string; subtopics?: string[] } | null;
      if (!parsed?.topic) continue;
      const topic = String(parsed.topic).trim();
      // Retry if too similar to existing
      const clash = isTooSimilar(topic, allExisting);
      if (clash && attempt < 2) continue;
      return {
        topic,
        subtopics: Array.isArray(parsed.subtopics)
          ? parsed.subtopics.map((s: unknown) => String(s).trim()).filter(Boolean).slice(0, 4)
          : [],
      };
    }
    return null;
  }

  if (weekNumber !== null) {
    // ── Single-week mode ─────────────────────────────────────────────────
    const result = await generateWeek(weekNumber, prevTopics);
    if (!result) {
      return NextResponse.json({ error: 'AI failed to generate a topic. Try again.' }, { status: 502 });
    }
    weeks = [{ week: weekNumber, ...result }];
    note  = `Week ${weekNumber} regenerated for ${className}.`;

  } else {
    // ── Full-term mode: sequential per-week with growing context ─────────
    const generatedTopics: string[] = [];
    const newWeeks: typeof weeks = [];
    let failCount = 0;

    for (let w = 1; w <= 12; w++) {
      if (lockedWeeks.includes(w)) continue; // skip completed/locked weeks

      const result = await generateWeek(w, [...prevTopics, ...generatedTopics.slice(-4)]);
      if (result) {
        generatedTopics.push(result.topic);
        newWeeks.push({ week: w, ...result });
      } else {
        failCount++;
        newWeeks.push({ week: w, topic: `Week ${w} — ${laneLabel}`, subtopics: [] });
      }
    }

    // ── Validation pass: one AI call reviewing the full arc ──────────────
    if (newWeeks.filter(w => w.topic !== `Week ${w.week} — ${laneLabel}`).length >= 8) {
      const topicList = newWeeks.map(w => `W${w.week}: ${w.topic}`).join('\n');
      const validatePrompt = `You are a Nigerian STEM curriculum reviewer.
Review these ${newWeeks.length} weekly topics for Programme Term ${termNumber} (${nat.name}), Year ${yearNumber}.
Technology: ${trackLabel || laneLabel}
Grade: ${GRADE_CONTEXT[gradeLevel] || gradeLevel || className}

${topicList}

Check:
1. Topics progress logically from basics → applied → advanced
2. No two topics are duplicates or too similar
3. All topics are specific to the stated technology track
4. Vocabulary is appropriate for the grade level
5. Week 1 is an orientation/review, Week 12 is synthesis/assessment prep

If all looks good return: {"valid": true, "note": "brief positive summary"}
If there are issues return: {"valid": false, "note": "brief description of issues", "fixes": {"3": "better topic for week 3", "7": "better topic for week 7"}}
Return ONLY valid JSON.`;

      const vRaw = await callAI(validatePrompt, 0.3);
      const vParsed = extractJSON(vRaw) as { valid?: boolean; note?: string; fixes?: Record<string, string> } | null;
      if (vParsed && !vParsed.valid && vParsed.fixes) {
        for (const [wStr, fixedTopic] of Object.entries(vParsed.fixes)) {
          const idx = newWeeks.findIndex(w => w.week === Number(wStr));
          if (idx >= 0) newWeeks[idx].topic = String(fixedTopic).trim();
        }
      }
      note = typeof vParsed?.note === 'string' ? vParsed.note.trim() : '';
    }

    weeks = newWeeks;
    if (!note) {
      note = failCount > 0
        ? `${weeks.length - failCount} weeks personalised (${failCount} used lane defaults).`
        : `All ${weeks.length} weeks personalised for ${className}.`;
    }
  }

  return NextResponse.json({ weeks, note });
}
