import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { isCourseVisibleToLearners, isProgramVisibleToRole } from '@/lib/courses/visibility';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireSession() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

async function getCallerRole(userId: string): Promise<string | null> {
  const { data } = await adminClient()
    .from('portal_users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  return data?.role ?? null;
}

/** Global program catalog — platform admins only (partner schools use curriculum UI, not this API). */
async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id')
    .eq('id', user.id)
    .single();
  if (!caller || caller.role !== 'admin') return null;
  return caller;
}

// GET /api/programs — admins: full list; others: flagship programmes + course rules (see visibility.ts)
export async function GET(request: NextRequest) {
  try {
    const user = await requireSession();
    const { searchParams } = new URL(request.url);
    const isActiveParam = searchParams.get('is_active');
    const publicCatalog = isActiveParam === 'true';
    if (!user && !publicCatalog) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let callerRole: string | null = null;
    if (user) callerRole = await getCallerRole(user.id);


    let query = adminClient()
      .from('programs')
      .select(
        '*, courses ( id, title, is_active, is_locked, program_id, lessons(id), assignments(id) )',
      )
      .order('created_at', { ascending: false });

    if (isActiveParam !== null) {
      query = query.eq('is_active', isActiveParam === 'true') as any;
    } else if (!publicCatalog && (!callerRole || !['admin', 'teacher', 'school'].includes(callerRole))) {
      // Students/parents should only see the active catalog when filter is omitted.
      query = query.eq('is_active', true) as any;
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Admins: full program list + all courses (incl. empty) for management UIs.
    // Teachers: same flagship list as school (Teen Developer, Young Innovator(s) only);
    //            still see empty courses in those programmes so they can add content.
    // School, students, parents, public: flagship programmes + only courses
    // with at least one lesson or assignment; programmes with zero visible
    // courses are omitted.
    const isAdmin = callerRole === 'admin';
    const isTeacher = callerRole === 'teacher';

    const rows = (data ?? [])
      .filter((row: any) => publicCatalog || isProgramVisibleToRole(row, callerRole ?? null))
      .map((row: any) => {
        if (isAdmin || isTeacher || publicCatalog) return row;
        const visibleCourses = (row.courses ?? []).filter((c: any) =>
          isCourseVisibleToLearners(
            { ...c, programs: { name: row.name } },
            { requireContent: true },
          ),
        );
        return { ...row, courses: visibleCourses };
      })
      .filter((row: any) => {
        if (isAdmin || isTeacher || publicCatalog) return true;
        return (row.courses?.length ?? 0) > 0;
      });

    return NextResponse.json({ success: true, data: rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// POST /api/programs — create program (admin only)
export async function POST(request: NextRequest) {
  try {
    const caller = await requireAdmin();
    if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const body = await request.json();
    const { name, description, duration_weeks, difficulty_level, price, max_students, is_active } = body;

    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    const { delivery_type, program_scope, school_progression_enabled, session_frequency_per_week, progression_policy } = body;
    const normalizedScope =
      program_scope === 'summer_school' || program_scope === 'online' || program_scope === 'bootcamp'
        ? program_scope
        : 'regular_school';
    const normalizedFreq = session_frequency_per_week === 2 ? 2 : 1;
    const rawPolicy = progression_policy && typeof progression_policy === 'object' ? progression_policy : {};
    const normalizedPolicy = {
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
      qa_min_pass_score: 75,
      qa_required_teacher_steps: 5,
      qa_required_student_steps: 5,
      qa_assessment_drift_mode: 'warn',
      qa_exam_drift_mode: 'fail',
      qa_five_step_mode: 'warn',
      teen_developers_sequence: [
        'javascript_foundation',
        'react_development',
        'ai_automation',
        'ui_ux_design',
        'mobile_capacitor',
      ],
      allow_additional_innovator_courses: true,
      ...rawPolicy,
    };

    const { data, error } = await adminClient()
      .from('programs')
      .insert({
        name: name.trim(),
        description: description || null,
        duration_weeks: duration_weeks || null,
        difficulty_level: difficulty_level || 'beginner',
        price: price ?? 0,
        max_students: max_students || null,
        is_active: is_active ?? true,
        delivery_type: delivery_type === 'optional' ? 'optional' : 'compulsory',
        program_scope: normalizedScope,
        school_progression_enabled:
          normalizedScope === 'regular_school' ? Boolean(school_progression_enabled) : false,
        session_frequency_per_week: normalizedFreq,
        progression_policy: normalizedPolicy,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
