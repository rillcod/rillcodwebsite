import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import OpenAI from 'openai';

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
  'google/gemini-2.0-flash-001',
  'moonshotai/kimi-k2.5',
  'deepseek/deepseek-chat-v3-5',
  'meta-llama/llama-3.3-70b-instruct',
  'google/gemini-2.0-flash-lite-001',
];

function buildCurriculumPrompt(
  courseName: string,
  gradeLevel: string,
  subjectArea: string,
  termCount: number,
  weeksPerTerm: number,
  notes?: string,
): string {
  return `You are an expert curriculum designer for Rillcod Technologies — a STEM/Coding innovation academy serving Nigerian partner schools (KG to SS3).

Your task: Design a COMPLETE, INNOVATIVE, and READY-TO-TEACH school curriculum.

Course: "${courseName}"
Grade Level: ${gradeLevel}
Subject Area: ${subjectArea}
Academic Terms: ${termCount}
Weeks Per Term: ${weeksPerTerm}
${notes ? `Special Notes: ${notes}` : ''}

ASSESSMENT SCHEDULE (mandatory every term):
- Week 3: First Assessment (type: "assessment")
- Week 6: Second Assessment (type: "assessment")
- Week ${weeksPerTerm}: End-of-Term Examination (type: "examination")
All other weeks: Lesson (type: "lesson")

WEEK TYPES: "lesson" | "assessment" | "examination"

LESSON_PLAN required for every lesson week:
{
  duration_minutes: 40,
  objectives: [3-4 measurable outcomes],
  teacher_activities: [5 steps: Hook(5min), Instruction(10min), Demo(10min), Practice(10min), Wrap-Up(5min)],
  student_activities: [mirroring teacher_activities],
  classwork: { title, instructions, materials[] },
  assignment: { title, instructions, due: "Next class" },
  project: null | { title, description, deliverables[] },
  resources: [string],
  engagement_tips: [3 tips with Nigerian/local context]
}

ASSESSMENT_PLAN required for assessment + examination weeks:
{
  type: "written"|"practical"|"mixed",
  title: string,
  coverage: [topic strings],
  format: string,
  duration_minutes: 40 (80 for exam),
  scoring_guide: string,
  teacher_prep: [steps],
  sample_questions: [3 examples]
}

CREATIVITY RULES:
- Topics must build progressively — NEVER repeat a project or topic
- Term 1 = Foundations, Term 2 = Application, Term 3 = Innovation & Real-World Projects
- Use Nigerian contexts: agritech, fintech, healthcare, entertainment, traffic, market pricing
- Vary tools across terms where possible (e.g. Scratch → Python → Web → Arduino)

Return ONLY valid JSON with this shape (no preamble, no markdown fences):
{
  "course_title": "string",
  "overview": "string (3 paragraphs)",
  "learning_outcomes": ["8 measurable outcomes"],
  "assessment_strategy": "string",
  "materials_required": ["string"],
  "recommended_tools": ["string"],
  "terms": [
    {
      "term": 1,
      "title": "string",
      "objectives": ["4 term objectives"],
      "weeks": [
        {
          "week": 1,
          "type": "lesson",
          "topic": "string",
          "subtopics": ["string"],
          "lesson_plan": { ... full lesson_plan object ... }
        },
        {
          "week": 3,
          "type": "assessment",
          "topic": "Mid-Term Assessment",
          "assessment_plan": { ... }
        }
      ]
    }
  ]
}`;
}

function safeParseJSON(raw: string): any {
  try { return JSON.parse(raw); } catch {}
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch {} }
  const brace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (brace !== -1 && lastBrace !== -1) {
    try { return JSON.parse(raw.slice(brace, lastBrace + 1)); } catch {}
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
  const supabase = await createClient();
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
  // School  → kept on the original broad scope (all courses in their school
  //           + global courses with is_visible_to_school=true), matching
  //           the SCHOOL_CURRICULUM_SYSTEM.md role matrix.
  let learnerCourseIds: string[] | null = null;
  if (role === 'student') {
    const { data: progs } = await supabase
      .from('student_level_enrollments')
      .select('course_id')
      .eq('student_id', user.id);
    learnerCourseIds = Array.from(
      new Set(((progs ?? []).map((r) => r.course_id).filter(Boolean) as string[])),
    );
    if (learnerCourseIds.length === 0) {
      return NextResponse.json({ data: [] });
    }
  } else if (role === 'parent') {
    // Parents see curricula for any course their linked children are enrolled in.
    const { data: children } = await supabase
      .from('students')
      .select('user_id')
      .eq('parent_email', user.email ?? '');
    const childIds = (children ?? []).map((c) => c.user_id).filter(Boolean) as string[];
    if (childIds.length === 0) return NextResponse.json({ data: [] });
    const { data: progs } = await supabase
      .from('student_level_enrollments')
      .select('course_id')
      .in('student_id', childIds);
    learnerCourseIds = Array.from(
      new Set(((progs ?? []).map((r) => r.course_id).filter(Boolean) as string[])),
    );
    if (learnerCourseIds.length === 0) {
      return NextResponse.json({ data: [] });
    }
  }

  let query = supabase
    .from('course_curricula')
    .select('*, courses!course_id(title), portal_users!created_by(full_name)')
    .order('created_at', { ascending: false });

  // Schools, students and parents respect the teacher-controlled
  // `is_visible_to_school` gate — teachers decide when the term's
  // syllabus is ready to share with the school & families.
  if (role !== 'admin' && role !== 'teacher') {
    query = query.eq('is_visible_to_school', true);
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
    }
  }

  if (courseId) query = query.eq('course_id', courseId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
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

  const { course_id, course_name, grade_level, term_count, weeks_per_term, subject_area, notes } = await req.json();
  if (!course_name) return NextResponse.json({ error: 'course_name is required' }, { status: 400 });
  if (!course_id) return NextResponse.json({ error: 'course_id is required' }, { status: 400 });
  const tc = Number(term_count ?? 3);
  const wpt = Number(weeks_per_term ?? 8);
  if (!Number.isInteger(tc) || tc < 1 || tc > 3) return NextResponse.json({ error: 'term_count must be 1–3' }, { status: 400 });
  if (!Number.isInteger(wpt) || wpt < 6) return NextResponse.json({ error: 'weeks_per_term must be at least 6' }, { status: 400 });

  const prompt = buildCurriculumPrompt(
    course_name,
    grade_level ?? 'JSS1',
    subject_area ?? 'STEM / Coding',
    tc,
    wpt,
    notes,
  );

  const aiContent = await generateCurriculum(prompt);
  if (!aiContent) {
    return NextResponse.json({ error: 'Syllabus generation failed — all AI models unavailable. Please try again.' }, { status: 502 });
  }

  // Update existing or insert new
  if (course_id) {
    let existingQuery = (supabase as any)
      .from('course_curricula')
      .select('id, version')
      .eq('course_id', course_id);
    if (profile.school_id) existingQuery = existingQuery.eq('school_id', profile.school_id);
    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from('course_curricula')
        .update({ content: aiContent, version: existing.version + 1, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data });
    }
  }

  const insertPayload: any = { content: aiContent, version: 1, created_by: user.id };
  if (course_id) insertPayload.course_id = course_id;
  if (profile.school_id) insertPayload.school_id = profile.school_id;

  const { data, error } = await (supabase as any)
    .from('course_curricula')
    .insert(insertPayload)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
