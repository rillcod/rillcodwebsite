import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessLessonScope } from './authz';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import {
  inferTermNumberFromPlanTerm,
  mapSyllabusWeekToPlanRow,
  type SyllabusWeekImport,
} from '@/lib/lesson-plans/syllabusImport';

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  return data ? { ...user, role: data.role, school_id: data.school_id } : null;
}

function canCreateLessonPlan(role: string | undefined) {
  return role === 'admin' || role === 'teacher';
}

// GET /api/lesson-plans — list lesson plans for a lesson or all accessible ones
export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const lessonId = searchParams.get('lesson_id');

  const db = createAdminClient();

  let query = db.from('lesson_plans').select(`
    *,
    created_by,
    courses(id, title, program_id),
    classes(id, name),
    schools(id, name),
    lessons(id, title, course_id, school_id, created_by,
      courses(id, title, program_id)
    )
  `).order('created_at', { ascending: false });

  if (lessonId) {
    query = query.eq('lesson_id', lessonId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tSchoolIds =
    user.role === 'teacher' ? await getTeacherSchoolIds(user.id, user.school_id) : [];

  // Filter by scope access for non-admins
  let plans = data ?? [];
  if (user.role !== 'admin') {
    plans = plans.filter((p: any) =>
      canAccessLessonScope(
        { id: user.id, role: user.role, school_id: user.school_id },
        {
          school_id: p?.lessons?.school_id ?? p?.school_id ?? null,
          // Prefer the plan's own created_by for term-level plans (no lesson_id).
          created_by: p?.created_by ?? p?.lessons?.created_by ?? null,
        },
        tSchoolIds,
      ),
    );
  }

  return NextResponse.json({ data: plans });
}

// POST /api/lesson-plans — create a term-level lesson plan (or legacy per-lesson upsert)
export async function POST(request: Request) {
  const user = await getUser();
  if (!user || !canCreateLessonPlan(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const {
    // Legacy per-lesson fields
    lesson_id, objectives, activities, assessment_methods, staff_notes, summary_notes,
    // New term-level fields (Req 15)
    plan_data, status, version, curriculum_version_id,
    term_start, term_end, sessions_per_week,
    school_id, course_id, class_id, term, created_by,
  } = body;

  const db = createAdminClient();

  // ── Term-level plan (new flow) ──────────────────────────────────────────
  if (course_id || (!lesson_id && (term_start || term_end))) {
    const targetSchoolId = school_id || user.school_id || null;

    // Validate teacher can only create plans inside assigned schools.
    if (user.role === 'teacher') {
      const teacherSchoolIds = await getTeacherSchoolIds(user.id, user.school_id);
      if (targetSchoolId && !teacherSchoolIds.includes(targetSchoolId)) {
        return NextResponse.json({ error: 'You can only create plans for your assigned schools' }, { status: 403 });
      }
    }

    // Ensure selected class belongs to the chosen school scope.
    if (class_id) {
      const { data: klass } = await db
        .from('classes')
        .select('id, school_id')
        .eq('id', class_id)
        .maybeSingle();
      if (!klass) {
        return NextResponse.json({ error: 'Selected class not found' }, { status: 400 });
      }
      const classSchoolId = (klass as { school_id: string | null }).school_id;
      if (targetSchoolId && classSchoolId && classSchoolId !== targetSchoolId) {
        return NextResponse.json({ error: 'Selected class does not belong to the selected school' }, { status: 400 });
      }
    }

    // Curriculum-school consistency guard:
    // - school plan may link school curriculum or platform curriculum
    // - platform plan may only link platform curriculum
    if (curriculum_version_id) {
      const { data: curriculum } = await db
        .from('course_curricula')
        .select('id, course_id, school_id')
        .eq('id', curriculum_version_id)
        .maybeSingle();
      if (!curriculum) {
        return NextResponse.json({ error: 'Selected curriculum not found' }, { status: 400 });
      }
      const curr = curriculum as { course_id: string | null; school_id: string | null };
      if (course_id && curr.course_id && curr.course_id !== course_id) {
        return NextResponse.json({ error: 'Selected curriculum is not for this course' }, { status: 400 });
      }
      if (targetSchoolId) {
        if (curr.school_id && curr.school_id !== targetSchoolId) {
          return NextResponse.json({ error: 'Selected curriculum belongs to a different school' }, { status: 400 });
        }
      } else if (curr.school_id) {
        return NextResponse.json({ error: 'Platform plans cannot link school-specific curriculum' }, { status: 400 });
      }
    }

    // Auto-import weeks from linked curriculum if no plan_data provided
    let autoPlanData = plan_data ?? {};
    if (curriculum_version_id && (!plan_data || !plan_data.weeks?.length)) {
      const { data: curriculum } = await db
        .from('course_curricula')
        .select('content')
        .eq('id', curriculum_version_id)
        .single();

      const curriculumContent = curriculum?.content as any;
      if (curriculumContent?.terms) {
        const termNum = inferTermNumberFromPlanTerm(term);
        const termData = curriculumContent.terms.find((t: any) => t.term === termNum)
          ?? curriculumContent.terms[0];

        if (termData?.weeks?.length) {
          autoPlanData = {
            weeks: termData.weeks.map((w: SyllabusWeekImport) => mapSyllabusWeekToPlanRow(w)),
          };
        }
      }
    }

    const { data, error } = await db.from('lesson_plans').insert({
      course_id: course_id || null,
      class_id: class_id || null,
      school_id: targetSchoolId,
      term: term || null,
      term_start: term_start || null,
      term_end: term_end || null,
      sessions_per_week: sessions_per_week ? Number(sessions_per_week) : null,
      curriculum_version_id: curriculum_version_id || null,
      plan_data: autoPlanData,
      status: status ?? 'draft',
      version: version ?? 1,
      created_by: created_by || user.id,
      updated_at: new Date().toISOString(),
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data }, { status: 201 });
  }

  // ── Legacy per-lesson upsert ────────────────────────────────────────────
  if (!lesson_id) return NextResponse.json({ error: 'lesson_id or course_id required' }, { status: 400 });

  const { data: lesson, error: lessonErr } = await db
    .from('lessons')
    .select('id, school_id, created_by')
    .eq('id', lesson_id)
    .maybeSingle();
  if (lessonErr || !lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });

  if (user.role === 'teacher') {
    const teacherSchoolIds = await getTeacherSchoolIds(user.id, user.school_id);
    const allowed = canAccessLessonScope(
      { id: user.id, role: user.role, school_id: user.school_id },
      { school_id: lesson.school_id ?? null, created_by: lesson.created_by ?? null },
      teacherSchoolIds,
    );
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await db.from('lesson_plans').upsert({
    lesson_id,
    objectives: objectives || null,
    activities: activities || null,
    assessment_methods: assessment_methods || null,
    staff_notes: staff_notes || null,
    summary_notes: summary_notes || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'lesson_id' }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
