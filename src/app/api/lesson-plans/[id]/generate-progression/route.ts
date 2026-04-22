import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Database, Json } from '@/types/supabase';

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
  term_start?: string | null;
  sessions_per_week: number | null;
  plan_data: Json | null;
  courses: CourseWithProgram | null;
  classes: ClassRow | null;
};
type GeneratedWeek = {
  week: number;
  topic: string;
  mastery_mode: 'strict' | 'soft';
  gating_state: 'locked' | 'unlocked' | 'mastered';
  project_id: string;
  project_key: string;
  track: string;
  delivery_mode: string;
  sessions_per_week: number;
  ai_module: string;
  practical_focus: boolean;
  repeated_project: boolean;
  concept_tags: string[];
  difficulty_level: number | null;
  objectives: string[];
  classwork: {
    prompt: string;
    estimated_minutes: number;
  };
  syllabus_ref: {
    phase: string;
    year_number: number;
    term_number: number;
    week_number: number;
  };
  assignment: {
    title: string;
    brief: string;
    submission_type: 'practical' | 'worksheet' | 'reflection';
    rubric: string[];
    estimated_minutes: number;
  };
  project: {
    title: string;
    description: string;
    deliverables: string[];
    demo_required: boolean;
  };
  practical_assessment: {
    skill_checkpoints: string[];
    max_score: number;
    pass_score: number;
    speed_target_minutes: number;
  };
  metadata: Json;
  progression_badge?: {
    id: string;
    label: string;
    variant: string;
  };
};
type SelectedProject = { project: ProjectRow; isRepeat: boolean };
type LessonPlanUpdate = Database['public']['Tables']['lesson_plans']['Update'];
type ProjectUsageInsert = Database['public']['Tables']['curriculum_project_usage']['Insert'];

function parseBasicLevel(className: string | null | undefined): number | null {
  if (!className) return null;
  const m = className.match(/basic\s*(\d+)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function parseJssLevel(className: string | null | undefined): number | null {
  if (!className) return null;
  const jss = className.match(/jss\s*(\d+)/i);
  if (jss) {
    const n = Number(jss[1]);
    return Number.isFinite(n) ? n : null;
  }
  const basic = parseBasicLevel(className);
  if (basic && basic >= 7 && basic <= 9) return basic - 6;
  return null;
}

function parseSsLevel(className: string | null | undefined): number | null {
  if (!className) return null;
  const ss = className.match(/ss\s*(\d+)/i);
  if (!ss) return null;
  const n = Number(ss[1]);
  return Number.isFinite(n) ? n : null;
}

function resolveGradeKeyFromClassName(className: string | null | undefined): string | null {
  const basic = parseBasicLevel(className);
  if (basic && basic >= 1 && basic <= 6) return `basic_${basic}`;
  const jss = parseJssLevel(className);
  if (jss && jss >= 1 && jss <= 3) return `jss_${jss}`;
  const ss = parseSsLevel(className);
  if (ss && ss >= 1 && ss <= 2) return `ss_${ss}`;
  return null;
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? null)) as Json;
}

function resolveTeenPhase(yearNumber: number, termNumber: number): string {
  if (yearNumber <= 1 && termNumber <= 2) return 'javascript_foundation';
  if (yearNumber <= 2 && termNumber <= 1) return 'react_development';
  if (yearNumber <= 2 && termNumber <= 3) return 'ai_automation';
  if (yearNumber <= 3 && termNumber <= 1) return 'ui_ux_design';
  return 'mobile_capacitor';
}

function buildWeekEntries(input: {
  selected: Array<{ project: ProjectRow; isRepeat: boolean }>;
  track: string;
  deliveryMode: string;
  sessionsPerWeek: number;
  aiModule: string;
  strictRoute: boolean;
  yearNumber: number;
  termNumber: number;
  syllabusPhase: string;
  startWeekNumber?: number;
  masteryMode: 'strict' | 'soft';
}): GeneratedWeek[] {
  const {
    selected,
    track,
    deliveryMode,
    sessionsPerWeek,
    aiModule,
    strictRoute,
    yearNumber,
    termNumber,
    syllabusPhase,
    startWeekNumber = 1,
    masteryMode,
  } = input;
  return selected.map(({ project, isRepeat }, idx) => {
    const week = startWeekNumber + idx;
    const assignmentTitle = `${project.title} - Weekly Practical`;
    const projectTitle = `${project.title} - Studio Build`;
    return {
      week,
      topic: project.title,
      mastery_mode: masteryMode,
      gating_state: idx === 0 ? 'unlocked' : 'locked',
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
      syllabus_ref: {
        phase: syllabusPhase,
        year_number: yearNumber,
        term_number: termNumber,
        week_number: week,
      },
      assignment: {
        title: assignmentTitle,
        brief: `Complete the weekly practical for ${project.title}. Submit screenshots/code and a short explanation of your decisions.`,
        submission_type: 'practical',
        rubric: [
          'Correct concept usage',
          'Working final output',
          'Code/block organization',
          'Creativity and iteration',
        ],
        estimated_minutes: Math.max(20, Math.round((project.estimated_minutes ?? 45) * 0.75)),
      },
      project: {
        title: projectTitle,
        description: `Build a practical project around ${project.title} and present your implementation steps.`,
        deliverables: [
          'Working build output',
          'Short build notes',
          'Class presentation/demo',
        ],
        demo_required: true,
      },
      practical_assessment: {
        skill_checkpoints: [
          'Can explain core logic used',
          'Can debug at least one issue independently',
          'Can improve final output after feedback',
        ],
        max_score: 100,
        pass_score: 60,
        speed_target_minutes: project.estimated_minutes ?? 45,
      },
      metadata: {
        ...asObject(project.metadata),
        teen_phase: resolveTeenPhase(yearNumber, termNumber),
      } as Json,
      ...(strictRoute
        ? {
            progression_badge: {
              id: 'platform-school-route',
              label: 'Platform → School Route',
              variant: 'strict',
            },
          }
        : {}),
    };
  });
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

  if (!profile || !['teacher', 'admin'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Only teacher or admin roles can generate progression plans.' }, { status: 403 });
  }

  const bodyRaw = await req.json().catch(() => ({} as unknown));
  const body = asObject(bodyRaw);
  const requestedYear = Number(body.year_number ?? 1);
  const requestedTerm = Number(body.term_number ?? 1);
  const requestedSession = Number(body.session_number ?? body.year_number ?? 1);
  const requestedWeek = Number(body.week_number ?? 1);
  const weeksCount = Math.max(1, Number(body.weeks_count ?? 12));
  const dryRun = body.dry_run === true;
  const requestedScope =
    body.scope === 'week' || body.scope === 'term' || body.scope === 'session' || body.scope === 'full_program'
      ? body.scope
      : 'term';
  const fullProgram = body.full_program === true;
  const overwriteExisting = body.overwrite_existing === true;

  const yearNumber = Number.isFinite(requestedYear) ? Math.min(Math.max(requestedYear, 1), 10) : 1;
  const termNumber = Number.isFinite(requestedTerm) ? Math.min(Math.max(requestedTerm, 1), 3) : 1;
  const sessionNumber = Number.isFinite(requestedSession) ? Math.min(Math.max(requestedSession, 1), 10) : 1;
  const weekNumber = Number.isFinite(requestedWeek) ? Math.min(Math.max(requestedWeek, 1), 200) : 1;
  const effectiveWeeksCount = requestedScope === 'week' ? 1 : weeksCount;

  const { data: planDataRaw, error: planErr } = await supabase
    .from('lesson_plans')
    .select(`
      id,
      school_id,
      class_id,
      course_id,
      term_start,
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
  if (!plan.school_id) {
    return NextResponse.json({ error: 'Lesson plan is missing school context.' }, { status: 422 });
  }
  const schoolId = plan.school_id;
  if (profile.role !== 'admin' && plan.school_id !== profile.school_id) {
    return NextResponse.json({ error: 'You can only generate progression for your school plans.' }, { status: 403 });
  }

  const program = plan.courses?.programs;
  if (!program || program.program_scope !== 'regular_school' || program.school_progression_enabled !== true) {
    return NextResponse.json({
      error: 'Progression is only available for regular_school programs with school progression enabled.',
    }, { status: 422 });
  }

  const policy = asObject(program.progression_policy);
  const strictRouteDefault = typeof policy.strict_route_default === 'boolean' ? policy.strict_route_default : true;
  const strictRoute = typeof body.strict_route === 'boolean' ? body.strict_route : strictRouteDefault;
  const basicLevel = parseBasicLevel(plan.classes?.name);
  const jssLevel = parseJssLevel(plan.classes?.name);
  const ssLevel = parseSsLevel(plan.classes?.name);
  const syllabusPhase =
    ssLevel && ssLevel <= 2
      ? 'ss_1_2'
      : jssLevel && jssLevel <= 3
        ? 'jss_1_3'
        : 'basic_1_6';
  const basic13Track = typeof policy.basic_1_3_track === 'string' ? policy.basic_1_3_track : 'young_innovator';
  const basic46Tracks = Array.isArray(policy.basic_4_6_tracks) ? policy.basic_4_6_tracks.filter((t) => typeof t === 'string') as string[] : ['python', 'html_css'];
  const jssTracks = Array.isArray(policy.jss_1_3_tracks)
    ? policy.jss_1_3_tracks.filter((t) => typeof t === 'string') as string[]
    : (typeof policy.jss_1_3_track === 'string' ? [policy.jss_1_3_track] : ['jss_web_app']);
  const ssTracks = Array.isArray(policy.ss_1_2_tracks)
    ? policy.ss_1_2_tracks.filter((t) => typeof t === 'string') as string[]
    : (typeof policy.ss_1_2_track === 'string' ? [policy.ss_1_2_track] : ['ss_uiux_mobile']);
  const jssTrack = jssTracks[0] ?? 'jss_web_app';
  const ssTrack = ssTracks[0] ?? 'ss_uiux_mobile';
  const trackFromPolicy =
    ssLevel && ssLevel <= 2
      ? ssTrack
      : jssLevel && jssLevel <= 3
        ? jssTrack
        : basicLevel && basicLevel <= 3
          ? basic13Track
          : (basic46Tracks[0] ?? 'python');
  const requestedTrack = typeof body.track === 'string' ? body.track : null;
  const track = requestedTrack ?? trackFromPolicy;
  const gradeKey = resolveGradeKeyFromClassName(plan.classes?.name);
  const deliveryMode = (typeof body.delivery_mode === 'string' ? body.delivery_mode : null) ?? (program.delivery_type === 'optional' ? 'optional' : 'compulsory');
  const sessionsPerWeek =
    body.weekly_frequency === 2 || body.weekly_frequency === 1
      ? body.weekly_frequency
      : (program.session_frequency_per_week === 2 ? 2 : (plan.sessions_per_week === 2 ? 2 : 1));

  const { data: registryRows, error: regErr } = await supabase
    .from('curriculum_project_registry')
    .select('id, school_id, project_key, title, track, concept_tags, difficulty_level, classwork_prompt, estimated_minutes, metadata')
    .eq('is_active', true)
    .eq('program_id', program.id)
    .or(`school_id.eq.${plan.school_id},school_id.is.null`)
    .in('track', [track, 'mixed'])
    .order('difficulty_level', { ascending: true })
    .order('created_at', { ascending: true });

  if (regErr) return NextResponse.json({ error: regErr.message }, { status: 500 });
  const registryAll = (registryRows ?? []) as ProjectRow[];
  const registry = gradeKey
    ? [
        ...registryAll.filter((p) => {
          const metadata = asObject(p.metadata);
          return metadata.grade_key === gradeKey;
        }),
        ...registryAll.filter((p) => {
          const metadata = asObject(p.metadata);
          const projectGradeKey = typeof metadata.grade_key === 'string' ? metadata.grade_key : null;
          return !projectGradeKey;
        }),
      ]
    : registryAll;
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
  const runUsedProjectIds = new Set<string>();
  const pickProjectsForTerm = (): SelectedProject[] => {
    const selected: SelectedProject[] = [];
    if (strictRoute) {
      const platformFresh = registry.filter((p) => !p.school_id && !usedProjectIds.has(p.id) && !runUsedProjectIds.has(p.id));
      const schoolFresh = registry.filter((p) => !!p.school_id && !usedProjectIds.has(p.id) && !runUsedProjectIds.has(p.id));
      const platformRepeat = registry.filter((p) => !p.school_id && (usedProjectIds.has(p.id) || runUsedProjectIds.has(p.id)));
      const schoolRepeat = registry.filter((p) => !!p.school_id && (usedProjectIds.has(p.id) || runUsedProjectIds.has(p.id)));
      const strictPool = [
        ...platformFresh.map((p) => ({ project: p, isRepeat: false })),
        ...schoolFresh.map((p) => ({ project: p, isRepeat: false })),
        ...platformRepeat.map((p) => ({ project: p, isRepeat: true })),
        ...schoolRepeat.map((p) => ({ project: p, isRepeat: true })),
      ];
      for (let i = 0; i < effectiveWeeksCount; i++) {
        const picked = strictPool[i % strictPool.length];
        selected.push({ project: picked.project, isRepeat: picked.isRepeat });
        runUsedProjectIds.add(picked.project.id);
      }
      return selected;
    }
    const freshProjects = registry.filter((p) => !usedProjectIds.has(p.id) && !runUsedProjectIds.has(p.id));
    const fallbackProjects = registry.filter((p) => usedProjectIds.has(p.id) || runUsedProjectIds.has(p.id));
    for (let i = 0; i < effectiveWeeksCount; i++) {
      if (freshProjects.length > 0) {
        const project = freshProjects[i % freshProjects.length];
        selected.push({ project, isRepeat: false });
        runUsedProjectIds.add(project.id);
      } else {
        const project = fallbackProjects[i % fallbackProjects.length];
        selected.push({ project, isRepeat: true });
        runUsedProjectIds.add(project.id);
      }
    }
    return selected;
  };

  const aiModule =
    typeof policy.basic_4_6_ai_module === 'string'
      ? policy.basic_4_6_ai_module
      : 'intro_ai_tools';
  const masteryMode: 'strict' | 'soft' = policy.mastery_mode === 'soft' ? 'soft' : 'strict';

  const currentPlanData = asObject(plan.plan_data);
  const progression = asObject(currentPlanData.progression);
  const generatedTerms = asObject(progression.generated_terms);
  const termSelections = new Map<string, SelectedProject[]>();
  const termGeneratedWeekMap = new Map<string, GeneratedWeek[]>();
  const generatedKeys: string[] = [];
  const lockedTermWarnings: string[] = [];
  let generatedWeekCount = 0;
  const makeTerm = (yearNo: number, termNo: number, startWeekNumber = 1) => {
    const key = `y${yearNo}t${termNo}`;
    const existingTerm = asObject(generatedTerms[key]);
    const existingStatus = existingTerm.term_status;
    if (existingStatus === 'locked') {
      lockedTermWarnings.push(`Skipped locked term ${key}`);
      return;
    }
    const existingWeeks = Array.isArray(existingTerm.weeks) ? (existingTerm.weeks as GeneratedWeek[]) : [];
    if (requestedScope !== 'week' && !overwriteExisting && generatedTerms[key]) return;
    if (requestedScope === 'week' && !overwriteExisting && existingWeeks.some((w) => w.week === startWeekNumber)) return;
    const selected = pickProjectsForTerm();
    termSelections.set(key, selected);
    const generatedWeeksForRun = buildWeekEntries({
      selected,
      track,
      deliveryMode,
      sessionsPerWeek,
      aiModule,
      strictRoute,
      yearNumber: yearNo,
      termNumber: termNo,
      syllabusPhase,
      startWeekNumber,
      masteryMode,
    });
    const generatedWeeks =
      requestedScope === 'week'
        ? [...existingWeeks.filter((w) => w.week !== startWeekNumber), ...generatedWeeksForRun]
            .sort((a, b) => a.week - b.week)
        : generatedWeeksForRun;
    termGeneratedWeekMap.set(key, generatedWeeksForRun);
    generatedWeekCount += generatedWeeksForRun.length;
    generatedTerms[key] = {
      year_number: yearNo,
      term_number: termNo,
      term_status: existingStatus === 'approved' ? 'approved' : 'draft',
      generated_at: new Date().toISOString(),
      generated_by: user.id,
      strict_route: strictRoute,
      track,
      delivery_mode: deliveryMode,
      sessions_per_week: sessionsPerWeek,
      weeks: generatedWeeks,
    };
    generatedKeys.push(key);
  };

  const effectiveFullProgram = fullProgram || requestedScope === 'full_program';
  if (effectiveFullProgram) {
    for (let y = 1; y <= 3; y++) {
      for (let t = 1; t <= 3; t++) {
        makeTerm(y, t);
      }
    }
  } else if (requestedScope === 'week') {
    makeTerm(yearNumber, termNumber, weekNumber);
  } else if (requestedScope === 'session') {
    for (let t = 1; t <= 3; t++) {
      makeTerm(sessionNumber, t);
    }
  } else {
    makeTerm(yearNumber, termNumber);
  }
  const activeKey = `y${yearNumber}t${termNumber}`;
  const activeTerm = asObject(generatedTerms[activeKey]);
  const activeWeeks = Array.isArray(activeTerm.weeks) ? activeTerm.weeks : [];

  const autoFlashcardsDefault =
    typeof policy.auto_flashcards_default === 'boolean' ? policy.auto_flashcards_default : true;
  const autoFlashcards =
    typeof body.auto_flashcards === 'boolean' ? body.auto_flashcards : autoFlashcardsDefault;
  if (dryRun) {
    const previewTerms = generatedKeys.map((key) => {
      const termObj = asObject(generatedTerms[key]);
      const weeks = Array.isArray(termObj.weeks) ? (termObj.weeks as GeneratedWeek[]) : [];
      const repeatedWeeks = weeks.filter((w) => w.repeated_project).length;
      return {
        key,
        year_number: termObj.year_number ?? null,
        term_number: termObj.term_number ?? null,
        total_weeks: weeks.length,
        repeated_weeks: repeatedWeeks,
        weeks,
      };
    });
    const totalWeeks = previewTerms.reduce((sum, t) => sum + t.total_weeks, 0);
    const repeatedWeeks = previewTerms.reduce((sum, t) => sum + t.repeated_weeks, 0);
    const repetitionRate = totalWeeks > 0 ? repeatedWeeks / totalWeeks : 0;
    const repetitionRisk =
      repetitionRate === 0 ? 'low' : repetitionRate <= 0.25 ? 'medium' : 'high';
    return NextResponse.json({
      data: {
        dry_run: true,
        lesson_plan_id: id,
        scope: effectiveFullProgram ? 'full_program' : requestedScope,
        track,
        grade_key: gradeKey,
        delivery_mode: deliveryMode,
        sessions_per_week: sessionsPerWeek,
        strict_route: strictRoute,
        auto_flashcards: autoFlashcards,
        projected_terms: previewTerms,
        projected_assignments: totalWeeks,
        projected_projects: totalWeeks,
        projected_flashcard_decks: autoFlashcards ? totalWeeks : 0,
        repeated_weeks: repeatedWeeks,
        repetition_risk: repetitionRisk,
        warnings: lockedTermWarnings,
        week_number: requestedScope === 'week' ? weekNumber : null,
      },
    });
  }

  const nextPlanData = {
    ...currentPlanData,
    // Keep compatibility with existing consumers that read plan_data.weeks.
    weeks: activeWeeks,
    progression: {
      ...progression,
      auto_fill_enabled: true,
      override_enabled: true,
      generated_terms: generatedTerms,
    },
  };

  const updatePayload: LessonPlanUpdate = {
    sessions_per_week: sessionsPerWeek,
    plan_data: toJson(nextPlanData),
    updated_at: new Date().toISOString(),
  };

  const { error: planUpdateErr } = await supabase
    .from('lesson_plans')
    .update(updatePayload)
    .eq('id', id);
  if (planUpdateErr) return NextResponse.json({ error: planUpdateErr.message }, { status: 500 });

  const targetTerms = generatedKeys
    .map((key) => {
      const match = key.match(/^y(\d+)t(\d+)$/);
      if (!match) return null;
      return { year: Number(match[1]), term: Number(match[2]) };
    })
    .filter((term): term is { year: number; term: number } => term !== null);
  const usagePayload: ProjectUsageInsert[] = targetTerms.flatMap(({ year, term }) => {
    const key = `y${year}t${term}`;
    const selected = termSelections.get(key) ?? [];
    const generatedWeeks = termGeneratedWeekMap.get(key) ?? [];
    return selected.map(({ project, isRepeat }, idx) => ({
      project_id: project.id,
      school_id: schoolId,
      course_id: plan.course_id,
      lesson_plan_id: plan.id,
      class_id: plan.class_id,
      year_number: year,
      term_number: term,
      week_number: generatedWeeks[idx]?.week ?? idx + 1,
      is_repeat: isRepeat,
      metadata: {
        track,
        delivery_mode: deliveryMode,
        sessions_per_week: sessionsPerWeek,
        auto_fill: true,
        override_enabled: true,
      },
    }));
  });
  if (usagePayload.length > 0) {
    const { error: usageInsertErr } = await supabase
      .from('curriculum_project_usage')
      .insert(usagePayload);
    if (usageInsertErr) return NextResponse.json({ error: usageInsertErr.message }, { status: 500 });
  }

  const desiredWorkItems: Array<{
    marker: string;
    type: 'homework' | 'project';
    week: GeneratedWeek;
    key: string;
  }> = [];
  for (const key of generatedKeys) {
    const termObj = asObject(generatedTerms[key]);
    const weeks = Array.isArray(termObj.weeks) ? (termObj.weeks as GeneratedWeek[]) : [];
    for (const week of weeks) {
      desiredWorkItems.push({ marker: `PGRA:${key}:w${week.week}`, type: 'homework', week, key });
      desiredWorkItems.push({ marker: `PGRP:${key}:w${week.week}`, type: 'project', week, key });
    }
  }
  if (plan.school_id && plan.course_id && desiredWorkItems.length > 0) {
    const { data: existingWorkRows, error: existingWorkErr } = await supabase
      .from('assignments')
      .select('id, assignment_type, metadata')
      .eq('school_id', plan.school_id)
      .eq('course_id', plan.course_id);
    if (existingWorkErr) return NextResponse.json({ error: existingWorkErr.message }, { status: 500 });
    const existingWorkByMarker = new Map<string, string>();
    for (const row of existingWorkRows ?? []) {
      const metadata = asObject(row.metadata);
      const marker = typeof metadata.marker === 'string' ? metadata.marker : null;
      if (marker) existingWorkByMarker.set(marker, row.id);
    }
    if (overwriteExisting) {
      const deleteIds = desiredWorkItems
        .map((w) => existingWorkByMarker.get(w.marker) ?? null)
        .filter((v): v is string => v !== null);
      if (deleteIds.length > 0) {
        const { error: deleteErr } = await supabase
          .from('assignments')
          .delete()
          .in('id', deleteIds);
        if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });
        for (const marker of desiredWorkItems.map((w) => w.marker)) existingWorkByMarker.delete(marker);
      }
    }
    const termStart = plan.term_start ? new Date(plan.term_start) : new Date();
    const inserts = desiredWorkItems
      .filter((w) => !existingWorkByMarker.has(w.marker))
      .map((w) => {
        const dueDate = new Date(termStart);
        dueDate.setDate(dueDate.getDate() + (w.week.week * 7) + (w.type === 'project' ? 7 : 0));
        return {
          course_id: plan.course_id,
          class_id: plan.class_id,
          school_id: schoolId,
          title: w.type === 'project' ? w.week.project.title : w.week.assignment.title,
          description: w.type === 'project' ? w.week.project.description : w.week.assignment.brief,
          instructions: w.type === 'project' ? w.week.project.deliverables.join('\n') : w.week.assignment.brief,
          assignment_type: w.type,
          due_date: dueDate.toISOString(),
          max_points: w.week.practical_assessment.max_score,
          metadata: {
            lesson_plan_id: plan.id,
            year_number: w.week.syllabus_ref.year_number,
            term_number: w.week.syllabus_ref.term_number,
            week_number: w.week.week,
            track,
            marker: w.marker,
            generated_from: 'progression_route',
          },
          questions: [],
        };
      });
    if (inserts.length > 0) {
      const { error: insertErr } = await supabase
        .from('assignments')
        .insert(inserts);
      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
  }

  if (autoFlashcards && schoolId && plan.course_id) {
    const desiredDecks: Array<{ marker: string; title: string; week: GeneratedWeek }> = [];
    for (const key of generatedKeys) {
      const termObj = asObject(generatedTerms[key]);
      const weeks = Array.isArray(termObj.weeks) ? (termObj.weeks as GeneratedWeek[]) : [];
      for (const week of weeks) {
        const marker = `PGR:${key}:w${week.week}`;
        desiredDecks.push({
          marker,
          title: `Auto Flashcards - ${week.topic} [${marker}]`,
          week,
        });
      }
    }
    const { data: existingDecks, error: existingDeckErr } = await supabase
      .from('flashcard_decks')
      .select('id,progression_policy_snapshot,course_id')
      .eq('created_by', user.id)
      .eq('school_id', schoolId)
      .eq('course_id', plan.course_id);
    if (existingDeckErr) return NextResponse.json({ error: existingDeckErr.message }, { status: 500 });
    const existingByMarker = new Map<string, { id: string }>();
    for (const deck of existingDecks ?? []) {
      const snapshot = asObject(deck.progression_policy_snapshot);
      const marker = typeof snapshot.marker === 'string' ? snapshot.marker : null;
      if (marker) existingByMarker.set(marker, { id: deck.id });
    }
    if (overwriteExisting) {
      const toDeleteIds = desiredDecks
        .map((d) => existingByMarker.get(d.marker)?.id ?? null)
        .filter((id): id is string => id !== null);
      if (toDeleteIds.length > 0) {
        const { error: deleteErr } = await supabase
          .from('flashcard_decks')
          .delete()
          .in('id', toDeleteIds);
        if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });
        for (const marker of desiredDecks.map((d) => d.marker)) existingByMarker.delete(marker);
      }
    }
    for (const deckDef of desiredDecks) {
      if (existingByMarker.has(deckDef.marker)) continue;
      const { data: createdDeck, error: deckErr } = await supabase
        .from('flashcard_decks')
        .insert({
          title: deckDef.title,
          lesson_id: null,
          course_id: plan.course_id,
          school_id: schoolId,
          created_by: user.id,
          school_progression_enabled: true,
          progression_track: track,
          progression_delivery_mode: deliveryMode,
          progression_weekly_frequency: sessionsPerWeek,
          progression_policy_snapshot: {
            source: 'auto_progression',
            marker: deckDef.marker,
            year_term_week: deckDef.week.syllabus_ref,
          },
        })
        .select('id')
        .single();
      if (deckErr || !createdDeck) return NextResponse.json({ error: deckErr?.message ?? 'Failed to create deck' }, { status: 500 });
      const objectiveText = deckDef.week.objectives.join(' | ');
      const cards = [
        { front: `Week ${deckDef.week.week} Topic`, back: deckDef.week.topic },
        { front: 'Learning Objectives', back: objectiveText || 'Apply concepts through practical work.' },
        { front: 'Classwork Prompt', back: deckDef.week.classwork.prompt },
        { front: 'Assignment', back: deckDef.week.assignment.brief },
        { front: 'Project Deliverables', back: deckDef.week.project.deliverables.join(' | ') },
        { front: 'Practical Checkpoints', back: deckDef.week.practical_assessment.skill_checkpoints.join(' | ') },
      ];
      const { error: cardsErr } = await supabase
        .from('flashcard_cards')
        .insert(cards.map((card, idx) => ({
          deck_id: createdDeck.id,
          front: card.front,
          back: card.back,
          position: idx + 1,
        })));
      if (cardsErr) return NextResponse.json({ error: cardsErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    data: {
      lesson_plan_id: id,
      year_number: yearNumber,
      term_number: termNumber,
      week_number: requestedScope === 'week' ? weekNumber : null,
      track,
      delivery_mode: deliveryMode,
      sessions_per_week: sessionsPerWeek,
      generated_weeks: generatedWeekCount,
      repeated_weeks: Array.from(termSelections.values()).flat().filter((w) => w.isRepeat).length,
      strict_route: strictRoute,
      scope: effectiveFullProgram ? 'full_program' : requestedScope,
      full_program: effectiveFullProgram,
      session_number: requestedScope === 'session' ? sessionNumber : null,
      overwrite_existing: overwriteExisting,
      generated_terms: generatedKeys,
      warnings: lockedTermWarnings,
      grade_key: gradeKey,
    },
  });
}
