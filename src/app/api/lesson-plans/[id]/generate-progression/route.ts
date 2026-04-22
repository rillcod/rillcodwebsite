import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

type ProjectRow = {
  id: string;
  school_id?: string | null;
  project_key: string;
  title: string;
  track: string;
  concept_tags: string[] | null;
  difficulty_level: number | null;
  classwork_prompt: string | null;
  estimated_minutes: number | null;
  metadata: Record<string, unknown> | null;
};

type ProgramPolicy = Record<string, unknown>;
type ProgramRow = {
  id: string;
  name: string | null;
  program_scope: string | null;
  delivery_type: string | null;
  school_progression_enabled: boolean | null;
  session_frequency_per_week: number | null;
  progression_policy: ProgramPolicy | null;
};
type CourseWithProgram = {
  id: string;
  title: string | null;
  program_id: string | null;
  programs: ProgramRow | null;
};
type ClassRow = { name: string | null };
type LessonPlanSource = {
  id: string;
  school_id: string | null;
  class_id: string | null;
  course_id: string | null;
  sessions_per_week: number | null;
  plan_data: Record<string, unknown> | null;
  courses: CourseWithProgram | null;
  classes: ClassRow | null;
};

function parseBasicLevel(className: string | null | undefined): number | null {
  if (!className) return null;
  const m = className.match(/basic\s*(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'school') {
    return NextResponse.json({ error: 'Only school role can generate school progression plans.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const requestedYear = Number(body.year_number ?? 1);
  const requestedTerm = Number(body.term_number ?? 1);
  const weeksCount = Math.max(1, Number(body.weeks_count ?? 12));
  const strictRoute = body.strict_route !== false;

  const yearNumber = Number.isFinite(requestedYear) ? Math.min(Math.max(requestedYear, 1), 10) : 1;
  const termNumber = Number.isFinite(requestedTerm) ? Math.min(Math.max(requestedTerm, 1), 3) : 1;

  const { data: planDataRaw, error: planErr } = await supabase
    .from('lesson_plans')
    .select(`
      id,
      school_id,
      class_id,
      course_id,
      sessions_per_week,
      plan_data,
      courses(
        id,
        title,
        program_id,
        programs(
          id,
          name,
          program_scope,
          delivery_type,
          school_progression_enabled,
          session_frequency_per_week,
          progression_policy
        )
      ),
      classes(name)
    `)
    .eq('id', id)
    .single();
  const plan = planDataRaw as unknown as LessonPlanSource | null;

  if (planErr || !plan) {
    return NextResponse.json({ error: 'Lesson plan not found.' }, { status: 404 });
  }
  if (!plan.school_id || plan.school_id !== profile.school_id) {
    return NextResponse.json({ error: 'You can only generate progression for your school plans.' }, { status: 403 });
  }

  const program = plan.courses?.programs;
  if (!program || program.program_scope !== 'regular_school' || program.school_progression_enabled !== true) {
    return NextResponse.json({
      error: 'Progression is only available for regular_school programs with school progression enabled.',
    }, { status: 422 });
  }

  const policy = asObject(program.progression_policy);
  const basicLevel = parseBasicLevel(plan.classes?.name);
  const basic13Track = typeof policy.basic_1_3_track === 'string' ? policy.basic_1_3_track : 'young_innovator';
  const basic46Tracks = Array.isArray(policy.basic_4_6_tracks) ? policy.basic_4_6_tracks.filter((t) => typeof t === 'string') as string[] : ['python', 'html_css'];
  const trackFromPolicy = basicLevel && basicLevel <= 3 ? basic13Track : (basic46Tracks[0] ?? 'python');
  const requestedTrack = typeof body.track === 'string' ? body.track : null;
  const track = requestedTrack ?? trackFromPolicy;
  const deliveryMode = (typeof body.delivery_mode === 'string' ? body.delivery_mode : null) ?? (program.delivery_type === 'optional' ? 'optional' : 'compulsory');
  const sessionsPerWeek =
    body.weekly_frequency === 2 || body.weekly_frequency === 1
      ? body.weekly_frequency
      : (program.session_frequency_per_week === 2 ? 2 : (plan.sessions_per_week === 2 ? 2 : 1));

  const { data: registryRows, error: regErr } = await (supabase as any)
    .from('curriculum_project_registry')
    .select('id, school_id, project_key, title, track, concept_tags, difficulty_level, classwork_prompt, estimated_minutes, metadata')
    .eq('is_active', true)
    .eq('program_id', program.id)
    .or(`school_id.eq.${plan.school_id},school_id.is.null`)
    .in('track', [track, 'mixed'])
    .order('difficulty_level', { ascending: true })
    .order('created_at', { ascending: true });

  if (regErr) return NextResponse.json({ error: regErr.message }, { status: 500 });
  const registry = (registryRows ?? []) as ProjectRow[];
  if (registry.length === 0) {
    return NextResponse.json({ error: `No active projects found for track "${track}".` }, { status: 422 });
  }

  const cutoffYear = Math.max(1, yearNumber - 2);
  const { data: usageRows, error: usageErr } = await supabase
    .from('curriculum_project_usage')
    .select('project_id')
    .eq('school_id', plan.school_id)
    .gte('year_number', cutoffYear);
  if (usageErr) return NextResponse.json({ error: usageErr.message }, { status: 500 });
  const usedProjectIds = new Set((usageRows ?? []).map((r) => r.project_id));

  const selected: Array<{ project: ProjectRow; isRepeat: boolean }> = [];
  if (strictRoute) {
    // Strict route: platform pool first, then school pool.
    const platformFresh = registry.filter((p) => !p.school_id && !usedProjectIds.has(p.id));
    const schoolFresh = registry.filter((p) => !!p.school_id && !usedProjectIds.has(p.id));
    const platformRepeat = registry.filter((p) => !p.school_id && usedProjectIds.has(p.id));
    const schoolRepeat = registry.filter((p) => !!p.school_id && usedProjectIds.has(p.id));
    const strictPool = [
      ...platformFresh.map((p) => ({ project: p, isRepeat: false })),
      ...schoolFresh.map((p) => ({ project: p, isRepeat: false })),
      ...platformRepeat.map((p) => ({ project: p, isRepeat: true })),
      ...schoolRepeat.map((p) => ({ project: p, isRepeat: true })),
    ];
    for (let i = 0; i < weeksCount; i++) {
      const picked = strictPool[i % strictPool.length];
      selected.push({ project: picked.project, isRepeat: picked.isRepeat });
    }
  } else {
    const freshProjects = registry.filter((p) => !usedProjectIds.has(p.id));
    const fallbackProjects = registry.filter((p) => usedProjectIds.has(p.id));
    for (let i = 0; i < weeksCount; i++) {
      if (freshProjects.length > 0) {
        const project = freshProjects[i % freshProjects.length];
        selected.push({ project, isRepeat: false });
      } else {
        const project = fallbackProjects[i % fallbackProjects.length];
        selected.push({ project, isRepeat: true });
      }
    }
  }

  const aiModule =
    typeof policy.basic_4_6_ai_module === 'string'
      ? policy.basic_4_6_ai_module
      : 'intro_ai_tools';

  const generatedWeeks = selected.map(({ project, isRepeat }, idx) => ({
    week: idx + 1,
    topic: project.title,
    project_id: project.id,
    project_key: project.project_key,
    track,
    delivery_mode: deliveryMode,
    sessions_per_week: sessionsPerWeek,
    ai_module: aiModule,
    practical_focus: true,
    repeated_project: isRepeat,
    concept_tags: project.concept_tags ?? [],
    difficulty_level: project.difficulty_level ?? null,
    objectives: [
      `Apply ${track.replace('_', ' ')} concepts in a practical build`,
      'Deliver a working output by end of week',
    ],
    classwork: {
      prompt: project.classwork_prompt ?? `Build and present: ${project.title}`,
      estimated_minutes: project.estimated_minutes ?? 45,
    },
    metadata: asObject(project.metadata),
    ...(strictRoute
      ? {
          progression_badge: {
            id: 'platform-school-route',
            label: 'Platform → School Route',
            variant: 'strict',
          },
        }
      : {}),
  }));

  const currentPlanData = asObject(plan.plan_data);
  const progression = asObject(currentPlanData.progression);
  const generatedTerms = asObject(progression.generated_terms);
  const key = `y${yearNumber}t${termNumber}`;

  generatedTerms[key] = {
    year_number: yearNumber,
    term_number: termNumber,
    generated_at: new Date().toISOString(),
    generated_by: user.id,
    strict_route: strictRoute,
    track,
    delivery_mode: deliveryMode,
    sessions_per_week: sessionsPerWeek,
    weeks: generatedWeeks,
  };

  const nextPlanData = {
    ...currentPlanData,
    // Keep compatibility with existing consumers that read plan_data.weeks.
    weeks: generatedWeeks,
    progression: {
      ...progression,
      generated_terms: generatedTerms,
    },
  };

  const { error: planUpdateErr } = await supabase
    .from('lesson_plans')
    .update({
      sessions_per_week: sessionsPerWeek,
      plan_data: nextPlanData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (planUpdateErr) return NextResponse.json({ error: planUpdateErr.message }, { status: 500 });

  const usagePayload = selected.map(({ project, isRepeat }, idx) => ({
    project_id: project.id,
    school_id: plan.school_id,
    course_id: plan.course_id,
    lesson_plan_id: plan.id,
    class_id: plan.class_id,
    year_number: yearNumber,
    term_number: termNumber,
    week_number: idx + 1,
    is_repeat: isRepeat,
    metadata: {
      track,
      delivery_mode: deliveryMode,
      sessions_per_week: sessionsPerWeek,
    },
  }));
  const { error: usageInsertErr } = await supabase
    .from('curriculum_project_usage')
    .insert(usagePayload);
  if (usageInsertErr) return NextResponse.json({ error: usageInsertErr.message }, { status: 500 });

  return NextResponse.json({
    data: {
      lesson_plan_id: id,
      year_number: yearNumber,
      term_number: termNumber,
      track,
      delivery_mode: deliveryMode,
      sessions_per_week: sessionsPerWeek,
      generated_weeks: generatedWeeks.length,
      repeated_weeks: generatedWeeks.filter((w) => w.repeated_project).length,
      strict_route: strictRoute,
    },
  });
}
