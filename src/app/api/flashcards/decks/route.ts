import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { resolveStudentProgramScope } from '@/lib/assignments/visibility';
import { canReadFlashcardDeck, getFlashcardCaller } from '@/lib/flashcards/auth';
import type { Database, Json } from '@/types/supabase';

export const dynamic = 'force-dynamic';
type ProgramRow = {
  id: string;
  program_scope: string | null;
  school_progression_enabled: boolean | null;
  session_frequency_per_week: number | null;
  delivery_type: string | null;
  progression_policy: Record<string, unknown> | null;
};
type CourseProgramRow = {
  id: string;
  program_id: string | null;
  programs: ProgramRow | null;
};
type FlashcardDeckInsert = Database['public']['Tables']['flashcard_decks']['Insert'];

// GET /api/flashcards/decks
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createAdminClient();
  const profile = await getFlashcardCaller(db as any, user.id);
  const url = new URL(req.url);
  const courseId = url.searchParams.get('course_id');
  const lessonId = url.searchParams.get('lesson_id');
  const termIdFilter = url.searchParams.get('term_id');
  const allSessions = url.searchParams.get('all_sessions') === '1';
  const role = profile?.role ?? '';

  // Use the admin client + explicit role scoping so a deck created under a different
  // (or null) school_id than the student isn't hidden by RLS/school mismatch.
  let query = db
    .from('flashcard_decks')
    .select('*, flashcard_cards(count), courses(program_id)')
    .order('created_at', { ascending: false });

  if (role === 'admin') {
    // sees everything
  } else if (role === 'teacher') {
    const scopedIds = await getTeacherSchoolIds(user.id, profile?.school_id ?? null);
    const ors = [`created_by.eq.${user.id}`];
    if (scopedIds.length > 0) ors.push(`school_id.in.(${scopedIds.join(',')})`);
    query = query.or(ors.join(',')) as any;
  } else if (role === 'school') {
    if (profile?.school_id) query = query.eq('school_id', profile.school_id) as any;
  } else {
    // student — decks for enrolled programmes/courses only, with school boundary.
    const scope = await resolveStudentProgramScope(db as any, user.id, profile?.class_id ?? null);
    const enrolledCourseIds = Array.from(scope.courseIds);
    const ors: string[] = [];
    if (enrolledCourseIds.length > 0) ors.push(`course_id.in.(${enrolledCourseIds.join(',')})`);
    if (profile?.school_id) ors.push(`school_id.eq.${profile.school_id}`);
    if (ors.length === 0) return NextResponse.json({ data: [] });
    query = query.or(ors.join(',')) as any;
  }
  if (courseId) query = query.eq('course_id', courseId) as any;
  if (lessonId) query = query.eq('lesson_id', lessonId) as any;

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { resolveAssignmentTermId, matchesAssignmentSession } = await import('@/lib/assignments/session');
  const liveTermId = termIdFilter || await resolveAssignmentTermId(db as any, {
    termId: termIdFilter,
    classId: profile?.class_id ?? null,
  });
  const sessionScoped = allSessions
    ? (data ?? [])
    : ((data ?? []) as any[]).filter((deck) =>
        matchesAssignmentSession(deck.term_id, liveTermId, true),
      );

  const scopedData = role === 'student'
    ? await Promise.all(sessionScoped.map(async (deck: any) => (profile && await canReadFlashcardDeck(db as any, profile, deck)) ? deck : null))
    : sessionScoped;
  return NextResponse.json({ data: scopedData.filter(Boolean) });
}

// POST /api/flashcards/decks
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const adminSupabase = createAdminClient();
  const profile = await getFlashcardCaller(adminSupabase as any, user.id);
  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Only staff can create flashcard decks' }, { status: 403 });
  }

  const {
    title,
    lesson_id,
    course_id,
    school_id,
    class_id,
    lesson_plan_id,
    curriculum_week_number,
    progression_track,
    progression_delivery_mode,
    progression_weekly_frequency,
  } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: 'Title is required', field: 'title' }, { status: 400 });

  let progressionContext: {
    enabled: boolean;
    track:
      | 'young_innovator'
      | 'scratch'
      | 'python'
      | 'html'
      | 'html_css'
      | 'jss_web_app'
      | 'jss_python'
      | 'ss_uiux_mobile'
      | null;
    deliveryMode: 'optional' | 'compulsory' | null;
    weeklyFrequency: 1 | 2 | null;
    policySnapshot: Json;
  } = {
    enabled: false,
    track: null,
    deliveryMode: null,
    weeklyFrequency: null,
    policySnapshot: {},
  };

  if (profile.role === 'school' && course_id) {
    const { data: courseData } = await supabase
      .from('courses')
      .select(
        `
          id,
          program_id,
          programs(
            id,
            program_scope,
            school_progression_enabled,
            session_frequency_per_week,
            delivery_type,
            progression_policy
          )
        `,
      )
      .eq('id', course_id)
      .maybeSingle();
    const courseRow = courseData as unknown as CourseProgramRow | null;

    const program = courseRow?.programs;
    const eligible =
      !!program &&
      program.program_scope === 'regular_school' &&
      program.school_progression_enabled === true;

    if (eligible) {
      const requestedTrack =
        progression_track === 'young_innovator' ||
        progression_track === 'scratch' ||
        progression_track === 'python' ||
        progression_track === 'html' ||
        progression_track === 'html_css' ||
        progression_track === 'jss_web_app' ||
        progression_track === 'jss_python' ||
        progression_track === 'ss_uiux_mobile'
          ? progression_track
          : null;
      const requestedMode =
        progression_delivery_mode === 'optional' || progression_delivery_mode === 'compulsory'
          ? progression_delivery_mode
          : null;
      const requestedFreq = progression_weekly_frequency === 2 ? 2 : progression_weekly_frequency === 1 ? 1 : null;

      const programPolicy = (program.progression_policy && typeof program.progression_policy === 'object')
        ? program.progression_policy
        : {};
      const normalizedSnapshot = {
        basic_1_3_track: 'young_innovator',
        basic_4_6_tracks: ['python', 'html_css'],
        basic_4_6_ai_module: 'intro_ai_tools',
        jss_1_3_program: 'teen_developers',
        jss_1_3_track: 'jss_web_app',
        jss_1_3_tracks: ['jss_web_app', 'jss_python', 'python', 'html_css'],
        jss_1_3_stack: ['react', 'tailwind', 'typescript'],
        ss_1_2_program: 'teen_developers',
        ss_1_2_track: 'ss_uiux_mobile',
        ss_1_2_tracks: ['ss_uiux_mobile', 'python', 'html_css'],
        ss_1_2_stack: ['ui_ux_design', 'capacitor_mobile_app'],
        ss_1_3_program: 'teen_developers',
        ss_1_3_track: 'ss_uiux_mobile',
        ss_1_3_tracks: ['ss_uiux_mobile', 'python', 'html_css'],
        ss_1_3_stack: ['ui_ux_design', 'capacitor_mobile_app'],
        standard_weeks_per_term: 8,
        teen_developers_sequence: [
          'javascript_foundation',
          'react_development',
          'ai_automation',
          'ui_ux_design',
          'mobile_capacitor',
        ],
        allow_additional_innovator_courses: true,
        ...programPolicy,
      };

      progressionContext = {
        enabled: true,
        track: requestedTrack ?? 'young_innovator',
        deliveryMode: requestedMode ?? (program.delivery_type === 'optional' ? 'optional' : 'compulsory'),
        weeklyFrequency: requestedFreq ?? (program.session_frequency_per_week === 2 ? 2 : 1),
        policySnapshot: normalizedSnapshot,
      };
    }
  }

  // Class-scoped decks inherit course, school, term and plan from the canonical class plan.
  let canonicalClassId: string | null = typeof class_id === 'string' ? class_id : null;
  let canonicalOfferingId: string | null = null;
  let canonicalOfferingPeriodId: string | null = null;
  let canonicalReleaseId: string | null = null;
  let canonicalPlanId: string | null = typeof lesson_plan_id === 'string' ? lesson_plan_id : null;
  let canonicalCourseId: string | null = typeof course_id === 'string' ? course_id : null;
  let canonicalLessonId: string | null = typeof lesson_id === 'string' ? lesson_id : null;
  let canonicalTermId: string | null = null;
  let canonicalSchoolId: string | null = null;
  if (canonicalPlanId || canonicalClassId) {
    if (!canonicalPlanId || !canonicalClassId) {
      return NextResponse.json({ error: 'class_id and lesson_plan_id are both required for class flashcards' }, { status: 400 });
    }
    const { data: plan } = await adminSupabase.from('lesson_plans')
      .select('id,class_id,course_id,term_id,school_id,status,academic_offering_id,offering_period_id,curriculum_release_id,classes!lesson_plans_class_id_fkey(teacher_id)')
      .eq('id', canonicalPlanId).maybeSingle();
    if (!plan || plan.status === 'archived' || plan.class_id !== canonicalClassId) {
      return NextResponse.json({ error: 'Active class lesson plan not found' }, { status: 400 });
    }
    const klass: any = Array.isArray(plan.classes) ? plan.classes[0] : plan.classes;
    if (profile.role === 'teacher' && klass?.teacher_id !== user.id) {
      return NextResponse.json({ error: 'You can only create decks for your assigned class' }, { status: 403 });
    }
    if (canonicalCourseId && canonicalCourseId !== plan.course_id) {
      return NextResponse.json({ error: 'Course does not match the class plan' }, { status: 400 });
    }
    canonicalCourseId = plan.course_id;
    canonicalOfferingId = plan.academic_offering_id;
    canonicalOfferingPeriodId = plan.offering_period_id;
    canonicalReleaseId = plan.curriculum_release_id;
    canonicalTermId = plan.term_id;
    canonicalSchoolId = plan.school_id;
    if (canonicalLessonId) {
      const { data: lesson } = await (adminSupabase as any).from('lessons').select('id,lesson_plan_id,class_id').eq('id', canonicalLessonId).maybeSingle();
      if (!lesson || lesson.lesson_plan_id !== canonicalPlanId || lesson.class_id !== canonicalClassId) {
        return NextResponse.json({ error: 'Lesson does not belong to the selected class plan' }, { status: 400 });
      }
    }
  }
  // Resolve school_id — use profile primary first, then teacher_schools for multi-school teachers
  let resolvedSchoolId: string | null = canonicalSchoolId ?? (typeof school_id === 'string' ? school_id : profile.school_id ?? null);
  if (profile.role === 'teacher') {
    const scopedIds = await getTeacherSchoolIds(user.id, profile.school_id ?? null);
    if (!resolvedSchoolId) resolvedSchoolId = scopedIds[0] ?? null;
    if (resolvedSchoolId && !scopedIds.includes(resolvedSchoolId)) {
      return NextResponse.json({ error: 'You can only create decks for your assigned schools.' }, { status: 403 });
    }
  } else if (profile.role === 'school' && resolvedSchoolId !== profile.school_id) {
    return NextResponse.json({ error: 'You can only create decks for your school.' }, { status: 403 });
  }

  if (canonicalCourseId) {
    const { data: course } = await adminSupabase
      .from('courses')
      .select('school_id')
      .eq('id', canonicalCourseId)
      .maybeSingle();
    if (!course) return NextResponse.json({ error: 'Selected course not found' }, { status: 400 });
    if (course.school_id && resolvedSchoolId && course.school_id !== resolvedSchoolId) {
      return NextResponse.json({ error: 'Selected course belongs to a different school.' }, { status: 400 });
    }
  }

  // DUPLICATE GUARD — repeated "generate" clicks / double-submits were creating twin
  // decks (same owner + title for the same lesson/course/session). Return the existing deck
  // instead of inserting a second one. Helper so the race-catch below can reuse it.
  const { resolveAssignmentTermId } = await import('@/lib/assignments/session');
  const deckTermId = canonicalOfferingPeriodId ? null : await resolveAssignmentTermId(adminSupabase as any, {
    termId: canonicalTermId,
    classId: canonicalClassId ?? profile?.class_id ?? null,
  });

  const findExistingDeck = async () => {
    let q = (adminSupabase as any).from('flashcard_decks').select('*').eq('created_by', user.id);
    q = canonicalClassId ? q.eq('class_id', canonicalClassId) : q.is('class_id', null);
    q = canonicalLessonId ? q.eq('lesson_id', canonicalLessonId) : q.is('lesson_id', null);
    q = canonicalCourseId ? q.eq('course_id', canonicalCourseId) : q.is('course_id', null);
    q = deckTermId ? q.eq('term_id', deckTermId) : q.is('term_id', null);
    const { data: scoped } = await q;
    const wanted = title.trim().toLowerCase();
    return (scoped ?? []).find((d: any) => (d.title ?? '').trim().toLowerCase() === wanted) ?? null;
  };

  const dup = await findExistingDeck();
  if (dup) return NextResponse.json({ data: dup, deduped: true }, { status: 200 });

  const insertPayload: Record<string, unknown> = {
    title: title.trim(),
    lesson_id: canonicalLessonId,
    course_id: canonicalCourseId,
    class_id: canonicalClassId,
    lesson_plan_id: canonicalPlanId,
    curriculum_week_number: Number.isInteger(Number(curriculum_week_number)) ? Number(curriculum_week_number) : null,
    created_by: user.id,
    school_progression_enabled: progressionContext.enabled,
    progression_track: progressionContext.track,
    progression_delivery_mode: progressionContext.deliveryMode,
    progression_weekly_frequency: progressionContext.weeklyFrequency,
    progression_policy_snapshot: progressionContext.policySnapshot,
    term_id: deckTermId,
    academic_offering_id: canonicalOfferingId,
    offering_period_id: canonicalOfferingPeriodId,
    curriculum_release_id: canonicalReleaseId,
  };
  if (resolvedSchoolId) insertPayload.school_id = resolvedSchoolId;

  const { data, error } = await (adminSupabase as any)
    .from('flashcard_decks')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    // Race: a concurrent request (or the DB unique guard) beat us to it — return theirs.
    if ((error as any).code === '23505') {
      const raced = await findExistingDeck();
      if (raced) return NextResponse.json({ data: raced, deduped: true }, { status: 200 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
