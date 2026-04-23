import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  isAlwaysPublicProgramName,
  isCourseVisibleToLearners,
  isProgramVisibleToRole,
} from '@/lib/courses/visibility';

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

// GET /api/programs/[id]
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireSession();
    const callerRole = user ? await getCallerRole(user.id) : null;
    const { id } = await context.params;
    const { data, error } = await adminClient()
      .from('programs')
      .select(
        '*, courses ( id, title, is_active, is_locked, program_id, lessons(id), assignments(id) )',
      )
      .eq('id', id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    if (!user && !data.is_active) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user && !data.is_active && (!callerRole || !['admin', 'teacher', 'school'].includes(callerRole))) {
      // Logged-in learners should not access inactive/private programs by id.
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Non-flagship “extra” programmes: only admins. Active catalog rows: flagship only
    // for non-admins. Inactive: teacher/school may open flagship-only programmes by id.
    if (callerRole !== 'admin') {
      if (data.is_active !== false) {
        if (!isProgramVisibleToRole(data, callerRole ?? null)) {
          return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
      } else if (user && ['teacher', 'school'].includes(callerRole || '')) {
        if (!isAlwaysPublicProgramName(data.name)) {
          return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }
      }
    }

    if (callerRole === 'admin' || callerRole === 'teacher') {
      return NextResponse.json({ success: true, data });
    }

    const filterCourses = () =>
      (data.courses ?? []).filter((c: any) =>
        isCourseVisibleToLearners(
          { ...c, programs: { name: data.name } },
          { requireContent: true },
        ),
      );

    if (!user) {
      const courses = filterCourses();
      return NextResponse.json({ success: true, data: { ...data, courses } });
    }

    if (['school', 'student', 'parent'].includes(callerRole || '')) {
      return NextResponse.json({ success: true, data: { ...data, courses: filterCourses() } });
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// PUT /api/programs/[id] — update program
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await requireAdmin();
    if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const { id } = await context.params;
    const body = await request.json();

    const allowed: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const fields = [
      'name',
      'description',
      'duration_weeks',
      'difficulty_level',
      'price',
      'max_students',
      'is_active',
      'delivery_type',
      'program_scope',
      'school_progression_enabled',
      'session_frequency_per_week',
      'progression_policy',
    ];
    for (const f of fields) {
      if (f in body) allowed[f] = body[f] ?? null;
    }

    // Keep progression policy restricted to regular_school programs only.
    const nextScope = (allowed.program_scope as string | undefined) ?? (body.program_scope as string | undefined);
    if (nextScope && ['summer_school', 'online', 'bootcamp'].includes(nextScope)) {
      allowed.school_progression_enabled = false;
    }

    if ('session_frequency_per_week' in allowed) {
      allowed.session_frequency_per_week = allowed.session_frequency_per_week === 2 ? 2 : 1;
    }

    if ('progression_policy' in allowed && allowed.progression_policy && typeof allowed.progression_policy === 'object') {
      const policy = allowed.progression_policy as Record<string, unknown>;
      allowed.progression_policy = {
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
        ...policy,
      };
    }

    const { data, error } = await adminClient()
      .from('programs')
      .update(allowed)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// DELETE /api/programs/[id]
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await requireAdmin();
    if (!caller) return NextResponse.json({ error: 'Admin access required' }, { status: 403 });

    const { id } = await context.params;
    const { error } = await adminClient()
      .from('programs')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
