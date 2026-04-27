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
  const { course_id, course_name, grade_level, term_count, weeks_per_term, subject_area, notes } = body;
  if (!course_name) return NextResponse.json({ error: 'course_name is required' }, { status: 400 });
  if (!course_id) return NextResponse.json({ error: 'course_id is required' }, { status: 400 });
  const tc = Number(term_count ?? 3);
  const wpt = Number(weeks_per_term ?? 8);
  if (!Number.isInteger(tc) || tc < 1 || tc > 3) return NextResponse.json({ error: 'term_count must be 1–3' }, { status: 400 });
  if (!Number.isInteger(wpt) || wpt < 6) return NextResponse.json({ error: 'weeks_per_term must be at least 6' }, { status: 400 });

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

  if (profile.role === 'teacher' && targetSchoolId) {
    const sids = await getTeacherSchoolIds(user.id, profile.school_id ?? null);
    if (!sids.includes(targetSchoolId)) {
      return NextResponse.json(
        { error: 'You can only create or update a syllabus for a school you are assigned to. Use the School scope dropdown.' },
        { status: 403 },
      );
    }
  }

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
    const { data: existing } = await admin.from('course_curricula').select('created_by').eq('id', id).single();
    if (existing && existing.created_by !== user.id) {
      return NextResponse.json({ error: 'You can only delete your own syllabus versions.' }, { status: 403 });
    }
  }

  const { error } = await admin.from('course_curricula').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
