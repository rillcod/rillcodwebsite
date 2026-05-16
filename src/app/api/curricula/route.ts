import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import OpenAI from 'openai';
import { getTeacherSchoolIds } from '@/lib/auth-utils';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // extend to 2 min for AI generation

const openRouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
  defaultHeaders: {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'https://rillcod.com',
    'X-Title': 'Rillcod Technologies',
  },
});

const CURRICULUM_MODELS = [
  'google/gemini-2.0-flash-001',       // Primary: 1M ctx, fast, reliable JSON
  'qwen/qwen3-235b-a22b:free',         // 235B free — thorough at structured syllabi
  'deepseek/deepseek-r1:free',         // Reasoning model — great for multi-week curriculum
  'moonshotai/kimi-k2.5',              // High intelligence fallback
  'deepseek/deepseek-chat-v3-5',       // Strong structured output
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

const SHARED_OUTPUT_SHAPE = `Return ONLY valid JSON — no preamble, no markdown fences:
{
  "course_title": "string",
  "overview": "string (2-3 paragraphs describing the full programme)",
  "learning_outcomes": ["6-8 measurable outcomes"],
  "assessment_strategy": "string",
  "materials_required": ["string"],
  "recommended_tools": ["string"],
  "terms": [
    {
      "term": 1,
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

function buildSchoolPrompt(
  courseName: string, gradeLevel: string, subjectArea: string,
  selectedTerms: number[], weeksPerTerm: number, programStartTerm: number = 1, notes?: string,
  previousTermsContext?: string,
): string {
  const themes = resolveTermThemes(programStartTerm);
  const termLines = selectedTerms
    .map((t) => `  - Term ${t} — ${NG_TERM_LABEL[t] ?? `Term ${t}`}: ${themes[t] ?? 'Progressive content'}`)
    .join('\n');

  const startNote = programStartTerm !== 1
    ? `\nPROGRAMME CALENDAR NOTE: This school's coding programme began in ${NG_TERM_LABEL[programStartTerm]}. That term is Year 1 / Term 1 for this school (Foundations). Content in Term ${programStartTerm} must be foundational and the progression must flow correctly through subsequent national calendar terms.`
    : '';

  const continuationBlock = previousTermsContext
    ? `\nCONTINUATION CONTEXT — Topics already covered in prior term(s) of this course (do NOT repeat these; build on them):
${previousTermsContext}
The new term(s) you generate must explicitly continue from where the above left off. Assume students have mastered those topics.`
    : '';

  return `You are an expert curriculum designer for Rillcod Technologies — a STEM/Coding academy for Nigerian partner schools (KG–SS3).

DELIVERY FORMAT: Traditional School (Nigerian Academic Calendar)
Course: "${courseName}" | Grade: ${gradeLevel} | Subject Area: ${subjectArea}${startNote}
${continuationBlock}
Generate term(s):
${termLines}

Target weeks per term: ${weeksPerTerm}. Use this as a GUIDE for pacing and assessment placement only — do not pad or cut topics artificially. Content determines length; a term may run ${weeksPerTerm - 1}–${weeksPerTerm + 1} lesson weeks if the subject matter demands it.
${notes ? `Teacher notes: ${notes}` : ''}

ASSESSMENT placement per term: ~Week 3 → First Assessment · ~Week 6 → Second Assessment · Final week → End-of-Term Exam/Project
Session types: "lesson" | "assessment" | "examination"
Duration per lesson: 40 minutes. Use Nigerian real-world contexts (agritech, fintech, education tech, smart systems).
${SHARED_LESSON_PLAN_SCHEMA}
${SHARED_OUTPUT_SHAPE}`;
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
${SHARED_LESSON_PLAN_SCHEMA}
${SHARED_OUTPUT_SHAPE}`;
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
      return buildSchoolPrompt(courseName, gradeLevel, subjectArea, opts.selectedTerms ?? [1, 2, 3], opts.weeksPerTerm ?? 8, opts.programStartTerm ?? 1, notes, opts.previousTermsContext);
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
  if (role === 'student') {
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
    const { data: children } = await supabase
      .from('students')
      .select('user_id')
      .eq('parent_email', user.email ?? '');
    const childIds = (children ?? []).map((c) => c.user_id).filter(Boolean) as string[];
    if (childIds.length > 0) {
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
    selected_terms, term_count, weeks_per_term, program_start_term,
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

  // Resolve school terms (only used for format=school)
  let termNums: number[] = [1, 2, 3];
  if (format === 'school') {
    if (Array.isArray(selected_terms) && selected_terms.length > 0) {
      termNums = (selected_terms as number[]).map(Number).filter((n) => [1, 2, 3].includes(n)).sort();
      if (!termNums.length) return NextResponse.json({ error: 'selected_terms must include at least one of 1, 2, 3' }, { status: 400 });
    } else {
      const tc = Number(term_count ?? 3);
      if (!Number.isInteger(tc) || tc < 1 || tc > 3) return NextResponse.json({ error: 'term_count must be 1–3' }, { status: 400 });
      termNums = Array.from({ length: tc }, (_, i) => i + 1);
    }
  }
  const wpt = Number(weeks_per_term ?? 8);

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

  // For school format: look for an existing curriculum for this course+school and extract
  // topics from terms NOT being regenerated so the AI can continue progressively.
  let previousTermsContext: string | undefined;
  if (format === 'school' && course_id) {
    try {
      let existingQ = admin
        .from('course_curricula')
        .select('content')
        .eq('course_id', course_id);
      if (targetSchoolId) existingQ = existingQ.eq('school_id', targetSchoolId);
      else existingQ = existingQ.is('school_id', null);
      const { data: existing } = await existingQ.maybeSingle();
      if (existing?.content?.terms?.length) {
        const existingTermNums = new Set(termNums);
        const priorTerms: any[] = (existing.content.terms as any[])
          .filter((t: any) => !existingTermNums.has(t.term))
          .sort((a: any, b: any) => a.term - b.term);
        if (priorTerms.length > 0) {
          previousTermsContext = priorTerms.map((t: any) => {
            const topics = (t.weeks ?? [])
              .filter((w: any) => w.type === 'lesson')
              .map((w: any) => `    - ${w.topic}`)
              .join('\n');
            return `Term ${t.term} (${NG_TERM_LABEL[t.term] ?? ''}):\n${topics}`;
          }).join('\n');
        }
      }
    } catch { /* non-fatal — generation continues without context */ }
  }

  const resolvedStartTerm = [1, 2, 3].includes(Number(program_start_term)) ? Number(program_start_term) : 1;

  const prompt = buildCurriculumPrompt(
    course_name,
    grade_level ?? 'General',
    subject_area ?? 'STEM / Coding',
    format,
    {
      selectedTerms: termNums,
      weeksPerTerm: wpt,
      programStartTerm: resolvedStartTerm,
      previousTermsContext,
      bootcampDurationWeeks: Number(bootcamp_duration_weeks ?? 4),
      bootcampSchedule: bootcamp_schedule ?? 'fulltime',
      onlineDurationWeeks: Number(online_duration_weeks ?? 8),
      onlineSessionsPerWeek: Number(online_sessions_per_week ?? 2),
      selfpacedModules: Number(selfpaced_modules ?? 6),
      selfpacedHoursPerModule: Number(selfpaced_hours_per_module ?? 2),
      notes,
    },
  );

  const aiContent = await generateCurriculum(prompt);
  if (!aiContent) {
    return NextResponse.json({ error: 'Syllabus generation failed — all AI models unavailable. Please try again.' }, { status: 502 });
  }

  // Inject custom term start dates if provided
  const termStartDates: Record<string, string> = body.term_start_dates ?? {};
  if (aiContent?.terms && Object.keys(termStartDates).length > 0) {
    aiContent.terms = aiContent.terms.map((term: any) => ({
      ...term,
      start_date: termStartDates[String(term.term)] || termStartDates[term.term] || term.start_date || null,
    }));
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
          version: (existing as { version: number }).version + 1,
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
