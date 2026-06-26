import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { getParentLinkScope } from '@/lib/parents/links';
import { geminiGenerateText } from '@/lib/gemini/client';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export const dynamic = 'force-dynamic';
// Online/bootcamp syllabi generate the whole course (16–24 weeks) in one large
// call, which routinely ran past the old 2-min cap and surfaced as a browser
// "network error". 300s is the Vercel Pro ceiling. (School/termly generation is
// smaller and was unaffected.)
export const maxDuration = 300;

const openRouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://rillcod.com',
    'X-Title': 'Rillcod Technologies',
  },
  // Bound each of the fallback models so a slow/hung one fails fast to the next
  // instead of eating the whole request budget. maxRetries:0 stops the SDK's
  // built-in backoff from silently multiplying latency per model.
  timeout: 45_000,
  maxRetries: 0,
});

const CURRICULUM_MODELS = [
  'google/gemini-2.5-flash',           // Cutting-edge premium stable
  'google/gemini-2.5-pro',            // Cutting-edge premium reasoning
  'deepseek/deepseek-r1:free',         // Reasoning model — great for multi-week curriculum
  'qwen/qwen3-235b-a22b:free',         // 235B free — thorough at structured syllabi
  'deepseek/deepseek-chat',            // Highly robust
  'google/gemini-2.0-flash-001',       // 1M ctx, fast fallback
  'meta-llama/llama-3.3-70b-instruct', // Reliable fallback
  'google/gemini-2.0-flash-lite-001',  // Emergency fallback
];

const NG_TERM_LABEL: Record<number, string> = {
  1: 'First Term (Sept–Dec)',
  2: 'Second Term (Jan–Apr)',
  3: 'Third Term (May–Aug)',
};

// Theme assigned to each national term depends on which term the programme started.
// programStartTerm is the national term number where "Year 1 begins" for this school.
function resolveTermThemes(programStartTerm: number): Record<number, string> {
  const THEMES = [
    'Foundations — core concepts, vocabulary, and introductory hands-on projects',
    'Application — deeper skills, guided builds, and collaborative projects',
    'Innovation — real-world capstone projects, peer presentations, and independent problem-solving',
  ];
  // Rotate so that national term `programStartTerm` gets theme index 0 (Foundations)
  const offset = programStartTerm - 1; // 0-based
  return {
    1: THEMES[(3 - offset + 0) % 3],
    2: THEMES[(3 - offset + 1) % 3],
    3: THEMES[(3 - offset + 2) % 3],
  };
}

type CurriculumFormat = 'school' | 'bootcamp' | 'online' | 'selfpaced';

const SHARED_LESSON_PLAN_SCHEMA = `
LESSON_PLAN required for every lesson/session entry:
{
  duration_minutes: number,
  objectives: [3-4 measurable outcomes],
  teacher_activities: [5 structured steps],
  student_activities: [matching steps],
  classwork: { title, instructions, materials[] },
  assignment: { title, instructions, due: string },
  project: null | { title, description, deliverables[] },
  resources: [string],
  engagement_tips: [3 practical tips]
}

ASSESSMENT_PLAN required for assessment/exam/checkpoint entries:
{
  type: "written"|"practical"|"mixed",
  title: string,
  coverage: [topic strings],
  format: string,
  duration_minutes: number,
  scoring_guide: string,
  teacher_prep: [steps],
  sample_questions: [3 examples]
}`;

function getSharedOutputShape(termNum: number = 1): string {
  return `Return ONLY valid JSON — no preamble, no markdown fences:
{
  "course_title": "string",
  "overview": "string (2-3 paragraphs describing the full programme)",
  "learning_outcomes": ["6-8 measurable outcomes"],
  "assessment_strategy": "string",
  "materials_required": ["string"],
  "recommended_tools": ["string"],
  "terms": [
    {
      "term": ${termNum},
      "title": "string (phase/module/week/term title)",
      "objectives": ["3-4 objectives for this phase"],
      "weeks": [
        {
          "week": 1,
          "type": "lesson",
          "topic": "string",
          "subtopics": ["string"],
          "lesson_plan": { ...full lesson_plan... }
        },
        {
          "week": 3,
          "type": "assessment",
          "topic": "string",
          "assessment_plan": { ...full assessment_plan... }
        }
      ]
    }
  ]
}`;
}

const SHARED_OUTPUT_SHAPE = getSharedOutputShape(1);

// Applied to EVERY curriculum format (school / bootcamp / online / self-paced /
// chunked online module). Enforces that no weekly topic, activity or assessment
// is repeated or lightly reworded anywhere in the output — each week must teach
// something genuinely new that builds on, rather than re-covers, prior weeks.
const CURRICULUM_UNIQUENESS_RULE = `

GLOBAL UNIQUENESS (critical — non-negotiable): Across the ENTIRE output — every year, term, module and week — each weekly topic, lesson title, hands-on activity and assessment MUST be distinct. Do NOT repeat, duplicate, restate, or lightly reword any topic, project, or task from one week/term/module to another. If a concept was already introduced, ADVANCE it (go deeper, add a new application, raise the difficulty) instead of re-teaching it. Before finalising, scan all weeks and remove or replace any that overlap. A repeated or paraphrased topic is a failure.`;

const CHRISTIAN_AFRICAN_CURRICULUM_GUIDELINE = `
- Christian STEM & Local African/Nigerian Integration:
  * We are a Christian STEM/Coding innovation academy. All generated courses, weekly topics, and learning activities MUST creatively combine Christian/Biblical narrative analogies with real-world African local technology innovation.
  * Weave standard STEM concepts with Bible story metaphors: e.g. Joshua's Walls of Jericho (loops/iteration), Noah's Ark animal database (arrays/lists/indexes), Moses' rod (variables/states), Tower of Babel (communications/APIs/protocols), Nehemiah's Wall construction (modular/functions/reusability), David's coordinate sling (physics/vectors).
  * Weave local African tech solutions (Kano solar irrigation smart systems, OPay USSD/ledgers, Lagos BRT ticket systems) alongside Biblical themes.
  * Frame weekly objectives, classwork, assignments, and capstone projects around Biblical scenarios and local African/Nigerian community-building solutions. Use African/Nigerian student names (Kofi, Chioma, Tunde, Musa, Fatima, Amina).
`;

function buildSchoolPrompt(
  courseName: string, gradeLevel: string, subjectArea: string,
  selectedTerms: number[], weeksPerTerm: number, programStartTerm: number = 1, notes?: string,
  previousTermsContext?: string, yearNumber: number = 1,
): string {
  const themes = resolveTermThemes(programStartTerm);
  const termLines = selectedTerms
    .map((t) => `  - Term ${t} — ${NG_TERM_LABEL[t] ?? `Term ${t}`}: ${themes[t] ?? 'Progressive content'}`)
    .join('\n');

  const startNote = programStartTerm !== 1
    ? `\nPROGRAMME CALENDAR NOTE: This school's coding programme began in ${NG_TERM_LABEL[programStartTerm]}. That term is Year 1 / Term 1 for this school (Foundations). Content in Term ${programStartTerm} must be foundational and the progression must flow correctly through subsequent national calendar terms.`
    : '';

  const yearBlock = yearNumber === 2
    ? `\nPROGRAMME YEAR 2 — DEEPER PRACTICE: Students have completed a full Year 1 of this course. Assume they have solid foundations. Introduce more complex projects, advanced techniques, greater student autonomy, peer review sessions, and more abstract concepts. Do NOT re-teach Year 1 basics — reference and build on them.`
    : yearNumber === 3
    ? `\nPROGRAMME YEAR 3 — MASTERY & INNOVATION: Students have 2 full years of experience with this course. Push for independent problem-solving, portfolio-ready capstone projects, industry-grade tools, peer leadership, mentoring younger cohorts, and advanced system design. This is the culminating year.`
    : '';

  const continuationBlock = previousTermsContext
    ? `\nCONTINUATION CONTEXT — Topics already covered (do NOT repeat; build directly and meaningfully beyond these):
${previousTermsContext}
All content you generate must be visibly more advanced than everything listed above.`
    : '';

  return `You are an expert curriculum designer for Rillcod Technologies — a STEM/Coding academy for Nigerian partner schools (KG–SS3).

DELIVERY FORMAT: Traditional School (Nigerian Academic Calendar)
Course: "${courseName}" | Grade: ${gradeLevel} | Subject Area: ${subjectArea} | Programme Year: ${yearNumber} of 3${startNote}${yearBlock}
${continuationBlock}
Generate term(s):
${termLines}

Target weeks per term: ${weeksPerTerm}. Use this as a GUIDE for pacing and assessment placement only — do not pad or cut topics artificially. Content determines length; a term may run ${weeksPerTerm - 1}–${weeksPerTerm + 1} lesson weeks if the subject matter demands it.
${notes ? `Teacher notes: ${notes}` : ''}

IMPORTANT: Each term object in your JSON must include "year": ${yearNumber} alongside "term".
ASSESSMENT placement per term: ~Week 3 → First Assessment · ~Week 6 → Second Assessment · Final week → End-of-Term Exam/Project
Session types: "lesson" | "assessment" | "examination"
Duration per lesson: 40 minutes. Use Nigerian real-world contexts (agritech, fintech, education tech, smart systems).

- Ground the curriculum in cutting-edge African/Nigerian tech narratives:
  * **Agritech Automation**: Irrigation, soil moisture sensors in Northern farms, automated poultry houses.
  * **Fintech Systems**: API integrations, payment ledgers, fraud detection (inspired by Flutterwave, Paystack, Interswitch).
  * **Smart City Systems**: Lagos BRT smart cards, solar grid controllers, automated traffic management.
  * **E-Commerce & Logistics**: Smart warehousing, pathfinding for delivery bikes.
- Ensure lessons push conceptual intelligence: we don't just teach code syntax; we teach problem-solving and architectural thinking.
${CHRISTIAN_AFRICAN_CURRICULUM_GUIDELINE}

${SHARED_LESSON_PLAN_SCHEMA}
${getSharedOutputShape(selectedTerms[0] ?? 1)}`;
}

function buildBootcampPrompt(
  courseName: string, gradeLevel: string, subjectArea: string,
  durationWeeks: number, schedule: string, notes?: string,
): string {
  const sessionsMap: Record<string, { perWeek: number; label: string; mins: number }> = {
    fulltime:  { perWeek: 5, label: 'Full-time (5 days/week, ~6 hrs/day)', mins: 360 },
    parttime:  { perWeek: 3, label: 'Part-time (3 days/week, ~4 hrs/day)', mins: 240 },
    weekend:   { perWeek: 2, label: 'Weekend-only (Sat + Sun, ~8 hrs/day)', mins: 480 },
    evening:   { perWeek: 3, label: 'Evening (3 evenings/week, ~2 hrs/session)', mins: 120 },
  };
  const s = sessionsMap[schedule] ?? sessionsMap.fulltime;
  const totalSessions = durationWeeks * s.perWeek;
  // Each "term" = 1 bootcamp week; "weeks" within = daily sessions
  return `You are an expert curriculum designer for Rillcod Technologies — a STEM/Coding innovation academy.

DELIVERY FORMAT: Bootcamp / Intensive Training
Course: "${courseName}" | Audience: ${gradeLevel} | Subject Area: ${subjectArea}
Schedule: ${s.label}
Duration: ${durationWeeks} week${durationWeeks > 1 ? 's' : ''} (${totalSessions} total sessions)
Session duration: ${s.mins} minutes per session
${notes ? `Special notes: ${notes}` : ''}

STRUCTURE:
- Output ${durationWeeks} "term" object(s), each representing ONE bootcamp week (term: 1 … ${durationWeeks}).
- Each term has ${s.perWeek} "week" entries (one per session that week; week: 1 … ${s.perWeek}).
- Term title: "Week N — [Theme]"
- FINAL session of each week: type "assessment" (practical checkpoint). All others: type "lesson".
- Final session of the LAST week: type "examination" (final project showcase).
- Sessions are project-driven, fast-paced, and hands-on. No homework-style assignments — classwork is the work.
- Engagement tips should reflect bootcamp intensity (pair programming, live builds, demos).
${CHRISTIAN_AFRICAN_CURRICULUM_GUIDELINE}

${SHARED_LESSON_PLAN_SCHEMA}
${SHARED_OUTPUT_SHAPE}`;
}

function buildOnlinePrompt(
  courseName: string, gradeLevel: string, subjectArea: string,
  durationWeeks: number, sessionsPerWeek: number, notes?: string,
): string {
  const totalSessions = durationWeeks * sessionsPerWeek;
  const modulesCount = Math.max(2, Math.ceil(durationWeeks / 3));
  const weeksPerModule = Math.round(durationWeeks / modulesCount);
  return `You are an expert curriculum designer for Rillcod Technologies — a STEM/Coding innovation academy.

DELIVERY FORMAT: Online / Virtual Learning Programme
Course: "${courseName}" | Audience: ${gradeLevel} | Subject Area: ${subjectArea}
Duration: ${durationWeeks} weeks | Sessions: ${sessionsPerWeek}/week (${totalSessions} total)
Session length: 60–90 minutes
${notes ? `Special notes: ${notes}` : ''}

STRUCTURE:
- Organise into ${modulesCount} modules (each term = 1 module), roughly ${weeksPerModule} weeks each.
- Term (module) title: "Module N — [Theme]"
- Each module has ${weeksPerModule * sessionsPerWeek} session entries ("weeks" in the JSON, numbered 1 onwards within the module).
- Assessment checkpoint every module-end (type "assessment"). Mid-programme and final: type "examination".
- Content must be async-friendly: self-contained sessions, clear written instructions, video/resource links in resources[].
- Assignments due: "Before next session". Engagement tips should cover screen fatigue, remote collaboration, async tools.
- Use Nigerian digital contexts (e-commerce, mobile apps, remote agri-monitoring).
${CHRISTIAN_AFRICAN_CURRICULUM_GUIDELINE}

${SHARED_LESSON_PLAN_SCHEMA}
${SHARED_OUTPUT_SHAPE}`;
}

/**
 * Single-module online prompt — generates EXACTLY ONE module (term) of an online
 * programme. This is the chunked path: the client calls once per module so each
 * request stays small and finishes well under the 60s serverless cap (the
 * full-course single call routinely timed out → "network error"). Prior module
 * themes are passed so each module continues the arc without repeating.
 */
function buildOnlineModulePrompt(
  courseName: string, gradeLevel: string, subjectArea: string,
  moduleIndex: number, totalModules: number, weeksThisModule: number,
  sessionsPerWeek: number, priorThemes: string[], notes?: string,
  priorWeekTopics: string[] = [],
): string {
  const sessions = Math.max(1, weeksThisModule * sessionsPerWeek);
  const isLast = moduleIndex >= totalModules;
  const priorBlock = priorThemes.length
    ? `\nMODULES ALREADY GENERATED (do NOT repeat — this module must continue beyond them):\n${priorThemes.map((t, i) => `  Module ${i + 1}: ${t}`).join('\n')}`
    : '';
  // Exact session topics already covered in earlier modules — the strongest
  // anti-repetition signal: every new session must be genuinely different.
  const coveredBlock = priorWeekTopics.length
    ? `\nSESSION TOPICS ALREADY COVERED (do NOT repeat, paraphrase, or lightly reword any of these — go deeper or cover new ground):\n${priorWeekTopics.slice(0, 60).map((t, i) => `  ${i + 1}. ${t}`).join('\n')}`
    : '';
  return `You are an expert curriculum designer for Rillcod Technologies — a STEM/Coding innovation academy.

DELIVERY FORMAT: Online / Virtual Learning Programme — SINGLE MODULE
Course: "${courseName}" | Audience: ${gradeLevel} | Subject Area: ${subjectArea}
Generate ONLY Module ${moduleIndex} of ${totalModules} for this programme — one term object, nothing else.
This module spans ~${weeksThisModule} week(s) at ${sessionsPerWeek} session(s)/week (${sessions} session entries).
Session length: 60–90 minutes
${notes ? `Special notes: ${notes}` : ''}
${priorBlock}${coveredBlock}

STRUCTURE (return EXACTLY ONE module as a single "terms" entry):
- term: ${moduleIndex}
- Module title: "Module ${moduleIndex} — [Theme]"
- ${sessions} session entries in "weeks" (numbered 1…${sessions} within this module).
- ${isLast
    ? 'FINAL session: type "examination" (capstone / final project showcase).'
    : 'FINAL session: type "assessment" (module checkpoint).'}
- Content must be async-friendly: self-contained sessions, clear written instructions, video/resource links in resources[].
- Assignments due: "Before next session". Engagement tips cover screen fatigue, remote collaboration, async tools.
- Use Nigerian digital contexts (e-commerce, mobile apps, remote agri-monitoring).
${CHRISTIAN_AFRICAN_CURRICULUM_GUIDELINE}

${SHARED_LESSON_PLAN_SCHEMA}
${getSharedOutputShape(moduleIndex)}`;
}

function buildSelfpacedPrompt(
  courseName: string, gradeLevel: string, subjectArea: string,
  modules: number, hoursPerModule: number, notes?: string,
): string {
  return `You are an expert curriculum designer for Rillcod Technologies — a STEM/Coding innovation academy.

DELIVERY FORMAT: Self-Paced Learning
Course: "${courseName}" | Audience: ${gradeLevel} | Subject Area: ${subjectArea}
Modules: ${modules} | Estimated time per module: ${hoursPerModule} hour${hoursPerModule > 1 ? 's' : ''}
Total estimated time: ${modules * hoursPerModule} hours
${notes ? `Special notes: ${notes}` : ''}

STRUCTURE:
- Each "term" = one self-contained learning module (term: 1 … ${modules}).
- Module title: "Module N — [Topic]"
- Each module contains 3–5 "week" entries (individual lessons/topics the learner completes independently).
- Final "week" of every module: type "assessment" (self-check quiz or mini-project). Last module final entry: "examination" (capstone project).
- Learner sets their own pace — no fixed due dates. assignment.due should say "Self-paced — complete before next module".
- Include clear module prerequisites in objectives[0].
- Resources[] must include at least 2 free online links or tools per lesson.
- Engagement tips should focus on motivation, self-accountability, and community sharing.
${CHRISTIAN_AFRICAN_CURRICULUM_GUIDELINE}

${SHARED_LESSON_PLAN_SCHEMA}
${SHARED_OUTPUT_SHAPE}`;
}

function buildCurriculumPrompt(
  courseName: string,
  gradeLevel: string,
  subjectArea: string,
  format: CurriculumFormat,
  opts: {
    selectedTerms?: number[];
    weeksPerTerm?: number;
    programStartTerm?: number;
    previousTermsContext?: string;
    yearNumber?: number;
    bootcampDurationWeeks?: number;
    bootcampSchedule?: string;
    onlineDurationWeeks?: number;
    onlineSessionsPerWeek?: number;
    selfpacedModules?: number;
    selfpacedHoursPerModule?: number;
    notes?: string;
  },
): string {
  const { notes } = opts;
  switch (format) {
    case 'bootcamp':
      return buildBootcampPrompt(courseName, gradeLevel, subjectArea, opts.bootcampDurationWeeks ?? 4, opts.bootcampSchedule ?? 'fulltime', notes);
    case 'online':
      return buildOnlinePrompt(courseName, gradeLevel, subjectArea, opts.onlineDurationWeeks ?? 8, opts.onlineSessionsPerWeek ?? 2, notes);
    case 'selfpaced':
      return buildSelfpacedPrompt(courseName, gradeLevel, subjectArea, opts.selfpacedModules ?? 6, opts.selfpacedHoursPerModule ?? 2, notes);
    default:
      return buildSchoolPrompt(courseName, gradeLevel, subjectArea, opts.selectedTerms ?? [1, 2, 3], opts.weeksPerTerm ?? 8, opts.programStartTerm ?? 1, notes, opts.previousTermsContext, opts.yearNumber ?? 1);
  }
}

function safeParseJSON(raw: string): any {
  try { return JSON.parse(raw); } catch { }
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch { } }
  const brace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (brace !== -1 && lastBrace !== -1) {
    try { return JSON.parse(raw.slice(brace, lastBrace + 1)); } catch { }
  }
  return null;
}

async function generateCurriculum(prompt: string): Promise<any> {
  // Direct Google Gemini API priority path — saves 100% of OpenRouter tokens.
  // Bound it: this path has no internal timeout, so a stalled Gemini call would
  // otherwise hang the whole request until the platform kills it. Cap at 60s and
  // fall through to the OpenRouter chain on timeout.
  if (process.env.GEMINI_API_KEY) {
    const SYSTEM_PROMPT = "You are an expert curriculum designer for Rillcod Technologies.";
    const geminiResult = await Promise.race([
      geminiGenerateText(SYSTEM_PROMPT, prompt, true),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 60_000)),
    ]).catch(() => null);
    if (geminiResult?.text) {
      try {
        const parsed = safeParseJSON(geminiResult.text);
        if (parsed?.terms?.length) return parsed;
      } catch (e) {
        console.warn('Direct Google Gemini curriculum parse failed, falling back to OpenRouter...', e);
      }
    }
  }

  for (const model of CURRICULUM_MODELS) {
    try {
      const response = await openRouter.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 16000,
        temperature: 0.55,
        response_format: { type: 'json_object' },
      });
      const content = response.choices[0]?.message?.content;
      if (!content) continue;
      const parsed = safeParseJSON(content);
      if (parsed?.terms?.length) return parsed;
    } catch {
      // try next model
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role, school_id')
    .eq('id', user.id)
    .single();
  const role = profile?.role ?? '';

  if (!['admin', 'teacher', 'school', 'student', 'parent'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const courseId = url.searchParams.get('course_id');

  // ─── Learner scope: build an allow-list of course_ids ───
  // Student → their enrolments. Parent → their children's enrolments.
  // If no enrolment records exist, fall back to school-scoped visible
  // curricula (is_visible_to_school=true + profile.school_id) so learners
  // can browse published syllabi even without a formal enrolment row.
  let learnerCourseIds: string[] | null = null;
  let learnerSchoolIds: string[] = [];
  if (role === 'student') {
    if (profile?.school_id) learnerSchoolIds = [profile.school_id];
    const { data: progs } = await supabase
      .from('student_level_enrollments')
      .select('course_id')
      .eq('student_id', user.id);
    const ids = Array.from(
      new Set(((progs ?? []).map((r) => r.course_id).filter(Boolean) as string[])),
    );
    if (ids.length > 0) learnerCourseIds = ids;
    // No enrollments → fall through to school-scoped query below
  } else if (role === 'parent') {
    // Parents see curricula for courses their linked children are enrolled in.
    // Use getParentLinkScope so both legacy parent_email matches AND explicit
    // parent_student_links rows (created via consent-form portal) are included.
    const adminForLinks = adminClient();
    const { studentUserIds: childIds } = await getParentLinkScope(adminForLinks, {
      id: user.id,
      email: user.email,
    });
    if (childIds.length > 0) {
      const { data: children } = await adminForLinks
        .from('portal_users')
        .select('school_id')
        .in('id', childIds);
      learnerSchoolIds = Array.from(new Set((children ?? []).map((row: any) => row.school_id).filter(Boolean)));
      const { data: progs } = await supabase
        .from('student_level_enrollments')
        .select('course_id')
        .in('student_id', childIds);
      const ids = Array.from(
        new Set(((progs ?? []).map((r) => r.course_id).filter(Boolean) as string[])),
      );
      if (ids.length > 0) learnerCourseIds = ids;
    }
    // No linked children or no enrollments → fall through to school-scoped query below
  }

  // Use admin client to bypass RLS for course_curricula reads.
  // The school role has no RLS policy on this table, so cookie-auth returns 0 rows
  // even for is_visible_to_school=true rows. Role-based WHERE filters below enforce scope.
  const admin = adminClient();
  let query = admin
    .from('course_curricula')
    .select('*, courses!course_id(title), portal_users!created_by(full_name), schools(id, name)')
    .order('created_at', { ascending: false });

  // Schools, students and parents respect the teacher-controlled
  // `is_visible_to_school` gate — teachers decide when the term's
  // syllabus is ready to share with the school & families.
  if (role !== 'admin' && role !== 'teacher') {
    query = query.eq('is_visible_to_school', true);
  }

  if (role === 'teacher') {
    const sids = await getTeacherSchoolIds(user.id, profile?.school_id ?? null);
    if (sids.length > 0) {
      query = query.or(`school_id.is.null,school_id.in.(${sids.join(',')})`);
    } else {
      query = query.is('school_id', null);
    }
  }

  if (role === 'school') {
    if (profile?.school_id) {
      query = query.or(`school_id.is.null,school_id.eq.${profile.school_id}`);
    } else {
      query = query.is('school_id', null);
    }
  }

  if (role === 'student' || role === 'parent') {
    if (learnerCourseIds && learnerCourseIds.length > 0) {
      query = query.in('course_id', learnerCourseIds);
      const schoolFilters = ['school_id.is.null', ...learnerSchoolIds.map((sid) => `school_id.eq.${sid}`)];
      query = query.or(schoolFilters.join(',')) as typeof query;
    } else if (profile?.school_id) {
      // No enrollments: scope to their school's published curricula
      query = query.or(`school_id.is.null,school_id.eq.${profile.school_id}`);
    }
  }

  if (courseId) query = query.eq('course_id', courseId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  // Per SCHOOL_CURRICULUM_SYSTEM.md: only Admin + Teacher can generate/regenerate curriculum.
  // Schools view curriculum but never author it.
  if (!profile || !['admin', 'teacher'].includes(profile.role ?? '')) {
    return NextResponse.json(
      { error: 'Only Rillcod admins and teachers can generate curricula. Schools view the curriculum but do not author it.' },
      { status: 403 },
    );
  }

  const body = await req.json();
  const {
    course_id, course_name, grade_level, subject_area, notes,
    // School
    selected_terms, term_count, weeks_per_term, program_start_term, programme_year,
    // Bootcamp
    bootcamp_duration_weeks, bootcamp_schedule,
    // Online
    online_duration_weeks, online_sessions_per_week,
    // Self-paced
    selfpaced_modules, selfpaced_hours_per_module,
    // Format
    format: rawFormat,
  } = body;
  if (!course_name) return NextResponse.json({ error: 'course_name is required' }, { status: 400 });
  if (!course_id) return NextResponse.json({ error: 'course_id is required' }, { status: 400 });

  const format: CurriculumFormat = ['school', 'bootcamp', 'online', 'selfpaced'].includes(rawFormat)
    ? (rawFormat as CurriculumFormat)
    : 'school';

  const resolvedYear = [1, 2, 3].includes(Number(programme_year)) ? Number(programme_year) : 1;
  const resolvedStartTerm = [1, 2, 3].includes(Number(program_start_term)) ? Number(program_start_term) : 1;

  // Resolve school terms (only used for format=school)
  let termNums: number[] = [1, 2, 3];
  if (format === 'school') {
    if (Array.isArray(selected_terms) && selected_terms.length > 0) {
      const getWeight = (t: number) => (t - resolvedStartTerm + 3) % 3;
      termNums = (selected_terms as number[])
        .map(Number)
        .filter((n) => [1, 2, 3].includes(n))
        .sort((a, b) => getWeight(a) - getWeight(b));
      if (!termNums.length) return NextResponse.json({ error: 'selected_terms must include at least one of 1, 2, 3' }, { status: 400 });
    } else {
      const tc = Number(term_count ?? 3);
      if (!Number.isInteger(tc) || tc < 1 || tc > 3) return NextResponse.json({ error: 'term_count must be 1–3' }, { status: 400 });
      termNums = Array.from({ length: tc }, (_, i) => ((resolvedStartTerm - 1 + i) % 3) + 1);
    }
  }
  const wpt = Number(weeks_per_term ?? 8);

  // ── Online chunking: the client generates ONE module per request (to stay under
  //    the 60s serverless cap). Detected by an explicit module_index. Hoisted here
  //    so the existing-content load below can merge + dedup against prior modules.
  const moduleIdx = Number(body.module_index);
  const isOnlineChunk = format === 'online' && Number.isInteger(moduleIdx) && moduleIdx >= 1;

  // ── Target school: one syllabus row per (course_id, school_id) — unique in DB.
  // - `school_id` omitted → admin defaults to platform (null); teacher defaults to profile.school_id.
  // - `school_id: null` → platform / shared Rillcod template.
  // - `school_id: "<uuid>"` → that partner school (teacher must be in teacher_schools or match profile.school_id).
  const hasExplicitSchool = Object.prototype.hasOwnProperty.call(body, 'school_id');
  let targetSchoolId: string | null;
  if (hasExplicitSchool) {
    targetSchoolId = body.school_id;
    if (targetSchoolId !== null && (typeof targetSchoolId !== 'string' || !targetSchoolId.length)) {
      return NextResponse.json({ error: 'school_id must be a UUID, or null for platform template' }, { status: 400 });
    }
  } else if (profile.role === 'admin') {
    targetSchoolId = null;
  } else {
    targetSchoolId = profile.school_id ?? null;
  }

  const admin = adminClient();
  if (targetSchoolId) {
    const { data: sch } = await admin.from('schools').select('id').eq('id', targetSchoolId).maybeSingle();
    if (!sch) {
      return NextResponse.json({ error: 'Unknown school' }, { status: 400 });
    }
  }

  // Platform templates (school_id = null) are admin-only
  if (targetSchoolId === null && profile.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only Rillcod admins can create or update platform-wide curriculum templates.' },
      { status: 403 },
    );
  }

  if (profile.role === 'teacher' && targetSchoolId) {
    const sids = await getTeacherSchoolIds(user.id, profile.school_id ?? null);
    if (!sids.includes(targetSchoolId)) {
      return NextResponse.json(
        { error: 'You can only create or update a syllabus for a school you are assigned to. Use the School scope dropdown.' },
        { status: 403 },
      );
    }
  }



  // For school format: fetch existing curriculum to build progressive context.
  // This covers both cross-year continuity (prior years) and same-year-other-terms.
  let previousTermsContext: string | undefined;
  let existingCurriculumContent: any = null;
  // Topics already covered by previously-generated online modules — fed into the
  // module prompt's avoid-list so each new module is genuinely non-overlapping.
  const priorOnlineWeekTopics: string[] = [];
  if (course_id && (format === 'school' || isOnlineChunk)) {
    try {
      let existingQ = admin
        .from('course_curricula')
        .select('content')
        .eq('course_id', course_id);
      if (targetSchoolId) existingQ = existingQ.eq('school_id', targetSchoolId);
      else existingQ = existingQ.is('school_id', null);
      const { data: existing } = await existingQ.maybeSingle();
      existingCurriculumContent = existing?.content ?? null;

      // Online chunk: collect every weekly topic from modules OTHER than the one
      // being generated now, so the model is told exactly what not to repeat.
      if (isOnlineChunk && Array.isArray(existingCurriculumContent?.terms)) {
        for (const t of existingCurriculumContent.terms as any[]) {
          if (Number(t.term) === moduleIdx) continue;
          for (const w of (t.weeks ?? [])) {
            const topic = (w?.topic ?? w?.title ?? '').toString().trim();
            if (topic) priorOnlineWeekTopics.push(topic);
          }
        }
      }

      if (format === 'school' && existingCurriculumContent?.terms?.length) {
        const existingTermNums = new Set(termNums);
        const contextParts: string[] = [];

        // Prior years (all terms from years < resolvedYear)
        if (resolvedYear > 1) {
          const priorYearTerms = (existingCurriculumContent.terms as any[])
            .filter((t: any) => (t.year ?? 1) < resolvedYear)
            .sort((a: any, b: any) => ((a.year ?? 1) - (b.year ?? 1)) || (a.term - b.term));
          if (priorYearTerms.length > 0) {
            const priorBlock = priorYearTerms.map((t: any) => {
              const yr = t.year ?? 1;
              const topics = (t.weeks ?? [])
                .filter((w: any) => w.type === 'lesson')
                .map((w: any) => `    - ${w.topic}`)
                .join('\n');
              return `Year ${yr}, Term ${t.term} (${NG_TERM_LABEL[t.term] ?? ''}):\n${topics}`;
            }).join('\n');
            contextParts.push(`PRIOR YEAR(S) — all topics already taught across previous year(s):\n${priorBlock}`);
          }
        }

        // Same year, terms NOT in the current regeneration batch
        const sameYearOtherTerms = (existingCurriculumContent.terms as any[])
          .filter((t: any) => (t.year ?? 1) === resolvedYear && !existingTermNums.has(t.term))
          .sort((a: any, b: any) => a.term - b.term);
        if (sameYearOtherTerms.length > 0) {
          const sameYearBlock = sameYearOtherTerms.map((t: any) => {
            const topics = (t.weeks ?? [])
              .filter((w: any) => w.type === 'lesson')
              .map((w: any) => `    - ${w.topic}`)
              .join('\n');
            return `Year ${resolvedYear}, Term ${t.term} (${NG_TERM_LABEL[t.term] ?? ''}):\n${topics}`;
          }).join('\n');
          contextParts.push(`SAME YEAR, OTHER TERMS already generated:\n${sameYearBlock}`);
        }

        if (contextParts.length > 0) {
          previousTermsContext = contextParts.join('\n\n');
        }
      }
    } catch { /* non-fatal — generation continues without context */ }
  }

  // Ground the generation in a teacher-supplied document (extracted PDF text) when
  // provided, so the syllabus/lessons align with the real material. Merged into the
  // existing `notes` so every prompt builder picks it up without signature changes.
  const sourceMaterial = typeof body.source_material === 'string' ? body.source_material.slice(0, 8000).trim() : '';
  const groundedNotes = sourceMaterial
    ? `${notes ? notes + '\n\n' : ''}SOURCE MATERIAL — build the curriculum, weekly topics and lessons STRICTLY from this teacher document; keep the same scope, order and terminology:\n"""\n${sourceMaterial}\n"""`
    : notes;

  // moduleIdx / isOnlineChunk computed earlier (before the existing-content load).
  const prompt = isOnlineChunk
    ? buildOnlineModulePrompt(
        course_name,
        grade_level ?? 'General',
        subject_area ?? 'STEM / Coding',
        moduleIdx,
        Number(body.total_modules ?? 1),
        Number(body.weeks_this_module ?? 3),
        Number(online_sessions_per_week ?? 2),
        Array.isArray(body.prior_module_themes)
          ? (body.prior_module_themes as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 12)
          : [],
        groundedNotes,
        priorOnlineWeekTopics,
      )
    : buildCurriculumPrompt(
        course_name,
        grade_level ?? 'General',
        subject_area ?? 'STEM / Coding',
        format,
        {
          selectedTerms: termNums,
          weeksPerTerm: wpt,
          programStartTerm: resolvedStartTerm,
          previousTermsContext,
          yearNumber: resolvedYear,
          bootcampDurationWeeks: Number(bootcamp_duration_weeks ?? 4),
          bootcampSchedule: bootcamp_schedule ?? 'fulltime',
          onlineDurationWeeks: Number(online_duration_weeks ?? 8),
          onlineSessionsPerWeek: Number(online_sessions_per_week ?? 2),
          selfpacedModules: Number(selfpaced_modules ?? 6),
          selfpacedHoursPerModule: Number(selfpaced_hours_per_module ?? 2),
          notes: groundedNotes,
        },
      );

  const aiContent = await generateCurriculum(prompt + CURRICULUM_UNIQUENESS_RULE);
  if (!aiContent) {
    return NextResponse.json({ error: 'Syllabus generation failed — all AI models unavailable. Please try again.' }, { status: 502 });
  }

  // Chunked online: merge this single module into the modules already saved for
  // this course, so each call persists the complete (growing) document. The first
  // module establishes the top-level overview/outcomes; later modules preserve them.
  if (isOnlineChunk && Array.isArray(aiContent.terms)) {
    aiContent.terms = aiContent.terms.map((t: any) => ({ ...t, term: moduleIdx, year: 1 }));
    const priorTerms: any[] = Array.isArray(existingCurriculumContent?.terms)
      ? (existingCurriculumContent.terms as any[]) : [];
    const kept = priorTerms.filter((t: any) => Number(t.term) !== moduleIdx);
    aiContent.terms = [...kept, ...aiContent.terms].sort((a: any, b: any) => Number(a.term) - Number(b.term));
    if (moduleIdx > 1 && existingCurriculumContent) {
      for (const k of ['course_title', 'overview', 'learning_outcomes', 'assessment_strategy', 'materials_required', 'recommended_tools'] as const) {
        if (existingCurriculumContent[k] != null) aiContent[k] = existingCurriculumContent[k];
      }
    }
  }

  // Stamp year onto every generated term (in case AI omits it) and inject term start dates.
  // Force term number to align with selected term in termNums to prevent AI schema drifts.
  const termStartDates: Record<string, string> = body.term_start_dates ?? {};
  if (aiContent?.terms && Array.isArray(aiContent.terms)) {
    aiContent.terms = aiContent.terms.map((term: any, idx: number) => {
      const resolvedTerm = (format === 'school' && termNums[idx]) ? termNums[idx] : (term.term || resolvedStartTerm);
      return {
        ...term,
        term: resolvedTerm,
        year: term.year ?? resolvedYear,
        start_date: termStartDates[String(resolvedTerm)] || termStartDates[resolvedTerm] || term.start_date || null,
      };
    });
  }

  // Persist program_start_term, format, and christian_stem in content.metadata so it survives page reloads
  const existingMeta = existingCurriculumContent?.metadata ?? {};
  aiContent.metadata = { 
    ...existingMeta, 
    ...(aiContent.metadata ?? {}), 
    program_start_term: resolvedStartTerm,
    format: format,
    christian_stem: true
  };

  // Multi-year and multi-term merge: keep terms from other years, and keep terms from the same
  // year that are NOT in the current regeneration batch (to prevent deletion).
  if (format === 'school' && existingCurriculumContent?.terms?.length && aiContent?.terms) {
    const existingTermNums = new Set(termNums);
    const keptTerms = (existingCurriculumContent.terms as any[])
      .filter((t: any) => (t.year ?? 1) !== resolvedYear || !existingTermNums.has(t.term));
    const mergedTerms = [...keptTerms, ...aiContent.terms]
      .sort((a: any, b: any) => ((a.year ?? 1) - (b.year ?? 1)) || (a.term - b.term));
    aiContent.terms = mergedTerms;
  }

  // Update existing or insert new — scope by (course_id, targetSchoolId).
  // Always use admin client here so RLS never silently drops the write.
  if (course_id) {
    let existingQuery = admin
      .from('course_curricula')
      .select('id, version')
      .eq('course_id', course_id);
    if (targetSchoolId) {
      existingQuery = existingQuery.eq('school_id', targetSchoolId) as typeof existingQuery;
    } else {
      existingQuery = existingQuery.is('school_id', null) as typeof existingQuery;
    }
    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      const { data, error } = await admin
        .from('course_curricula')
        .update({
          content: { ...aiContent, description: body.description || null },
          version: (existing as { version: number }).version,
          updated_at: new Date().toISOString(),
        })
        .eq('id', (existing as { id: string }).id)
        .select('*, schools(id, name)')
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data });
    }
  }

  const insertPayload: Record<string, unknown> = {
    content: { ...aiContent, description: body.description || null },
    version: 1,
    created_by: user.id,
    is_visible_to_school: body.is_visible_to_school === true,
  };
  if (course_id) insertPayload.course_id = course_id;
  insertPayload.school_id = targetSchoolId;

  const { data, error } = await admin
    .from('course_curricula')
    .insert(insertPayload as any)
    .select('*, schools(id, name)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { data: profile } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
  if (!profile || !['admin', 'teacher'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = adminClient();
  
  // Verify ownership if teacher
  if (profile.role === 'teacher') {
    const { data: existing } = await admin.from('course_curricula').select('created_by, school_id').eq('id', id).single();
    // Platform curricula (school_id = null) are admin-only to delete; teachers can clone/hide but not delete
    if (existing && existing.school_id === null) {
      return NextResponse.json({ error: 'Platform curricula cannot be deleted. Clone it to create your own version.' }, { status: 403 });
    }
    if (existing && existing.created_by !== user.id) {
      return NextResponse.json({ error: 'You can only delete your own syllabus versions.' }, { status: 403 });
    }
  }

  const { error } = await admin.from('course_curricula').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
