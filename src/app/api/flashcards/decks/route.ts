import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
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

  const { data: profile } = await supabase.from('portal_users').select('school_id, role').eq('id', user.id).single();
  const url = new URL(req.url);
  const courseId = url.searchParams.get('course_id');
  const lessonId = url.searchParams.get('lesson_id');

  let query = supabase
    .from('flashcard_decks')
    .select('*, flashcard_cards(count)')
    .order('created_at', { ascending: false });

  if (profile?.role === 'teacher') {
    query = query.eq('created_by', user.id) as any;
  } else if (profile?.school_id) {
    query = query.eq('school_id', profile.school_id);
  }
  if (courseId) query = query.eq('course_id', courseId);
  if (lessonId) query = query.eq('lesson_id', lessonId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST /api/flashcards/decks
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Only teachers can create flashcard decks' }, { status: 403 });
  }

  const {
    title,
    lesson_id,
    course_id,
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

  // Resolve school_id — use profile primary first, then teacher_schools for multi-school teachers
  let resolvedSchoolId: string | null = profile.school_id ?? null;
  if (!resolvedSchoolId && profile.role === 'teacher') {
    const { data: tsRows } = await supabase
      .from('teacher_schools')
      .select('school_id')
      .eq('teacher_id', user.id)
      .limit(1);
    resolvedSchoolId = (tsRows?.[0] as any)?.school_id ?? null;
  }

  const insertPayload: FlashcardDeckInsert = {
    title: title.trim(),
    lesson_id: lesson_id || null,
    course_id: course_id || null,
    created_by: user.id,
    school_progression_enabled: progressionContext.enabled,
    progression_track: progressionContext.track,
    progression_delivery_mode: progressionContext.deliveryMode,
    progression_weekly_frequency: progressionContext.weeklyFrequency,
    progression_policy_snapshot: progressionContext.policySnapshot,
  };
  if (resolvedSchoolId) insertPayload.school_id = resolvedSchoolId;

  const { data, error } = await supabase
    .from('flashcard_decks')
    .insert(insertPayload)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
