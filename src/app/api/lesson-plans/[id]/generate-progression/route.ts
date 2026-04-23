import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  resolveDefaultTrackFromPolicy,
  resolveGradeKeyFromClassName,
  resolveSyllabusPhaseFromClassName,
} from '@/lib/progression/lessonPlanProgressionContext';
import { getSyllabusTermWeeks, type SyllabusContentImport } from '@/lib/lesson-plans/syllabusImport';
import {
  buildCanonicalWeekShape,
  type HarmonizedAssessmentPlan,
  type HarmonizedLessonPlan,
  type HarmonizedWeekType,
} from '@/lib/progression/harmonizedWeek';
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
type PreflightStatus = 'pass' | 'warn' | 'fail';
type PreflightCheck = {
  key: string;
  label: string;
  status: PreflightStatus;
  detail: string;
  blocking?: boolean;
};
type PreflightResult = {
  status: 'ready' | 'warning' | 'blocked';
  blocking: boolean;
  checks: PreflightCheck[];
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
};
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
  curriculum?: { content?: SyllabusContentImport | null } | null;
};
type GeneratedWeek = {
  week: number;
  type: HarmonizedWeekType;
  topic: string;
  subtopics: string[];
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
  objectives: string;
  objective_items: string[];
  activities: string;
  notes: string;
  lesson_plan: HarmonizedLessonPlan | null;
  assessment_plan: HarmonizedAssessmentPlan | null;
  syllabus_week_type: HarmonizedWeekType;
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

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function hasStructuredProgressionMetadata(metadata: Record<string, unknown>): boolean {
  const year = Number(metadata.year_number ?? 0);
  const term = Number(metadata.term_number ?? 0);
  const week = Number(metadata.week_number ?? metadata.week_index ?? 0);
  return Number.isFinite(year) && year > 0
    && Number.isFinite(term) && term > 0
    && Number.isFinite(week) && week > 0;
}

function normalizeTrackCandidates(primaryTrack: string, policy: ProgramPolicy): string[] {
  const values = [primaryTrack, ...asStringArray(policy.track_priority), 'mixed']
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(values));
}

function getTrackRank(track: string, candidates: string[]): number {
  const idx = candidates.indexOf(track);
  return idx === -1 ? candidates.length + 1 : idx;
}

function sortRegistryRows(rows: ProjectRow[], trackCandidates: string[]): ProjectRow[] {
  return [...rows].sort((a, b) => {
    const trackDelta = getTrackRank(a.track, trackCandidates) - getTrackRank(b.track, trackCandidates);
    if (trackDelta !== 0) return trackDelta;
    const schoolDelta = Number(Boolean(a.school_id)) - Number(Boolean(b.school_id));
    if (schoolDelta !== 0) return schoolDelta;
    const difficultyDelta = (a.difficulty_level ?? 0) - (b.difficulty_level ?? 0);
    if (difficultyDelta !== 0) return difficultyDelta;
    return a.title.localeCompare(b.title);
  });
}

function buildPreflight(input: {
  className: string | null;
  gradeKey: string | null;
  curriculumWeeks: ReturnType<typeof getSyllabusTermWeeks>;
  program: ProgramRow;
  policy: ProgramPolicy;
  registryAll: ProjectRow[];
  registryFiltered: ProjectRow[];
  primaryTrack: string;
  trackCandidates: string[];
  effectiveWeeksCount: number;
  essentialRoutesOnly: boolean;
}): PreflightResult {
  const {
    className,
    gradeKey,
    curriculumWeeks,
    program,
    policy,
    registryAll,
    registryFiltered,
    primaryTrack,
    trackCandidates,
    effectiveWeeksCount,
    essentialRoutesOnly,
  } = input;
  const checks: PreflightCheck[] = [];
  const primaryTrackRows = registryAll.filter((row) => row.track === primaryTrack);
  const fallbackTrackRows = registryAll.filter((row) => row.track !== primaryTrack);

  checks.push({
    key: 'program_progression',
    label: 'Program progression enabled',
    status: program.school_progression_enabled === true ? 'pass' : 'fail',
    detail: program.school_progression_enabled === true
      ? `Program "${program.name ?? 'Untitled program'}" allows school progression generation.`
      : 'Enable school progression on the linked program before generating routes.',
    blocking: program.school_progression_enabled !== true,
  });
  checks.push({
    key: 'class_mapping',
    label: 'Class naming resolved',
    status: className ? 'pass' : 'fail',
    detail: className
      ? `Class "${className}" is linked to this lesson plan.`
      : 'Set a class name on this lesson plan so grade and syllabus routing can resolve.',
    blocking: !className,
  });
  checks.push({
    key: 'grade_key',
    label: 'Grade key mapped',
    status: gradeKey ? 'pass' : 'fail',
    detail: gradeKey
      ? `Grade key resolved as "${gradeKey}".`
      : 'The current class name does not map to a supported grade key for progression seeds.',
    blocking: !gradeKey,
  });
  checks.push({
    key: 'curriculum_link',
    label: 'Curriculum weeks linked',
    status: curriculumWeeks.length > 0 ? 'pass' : 'warn',
    detail: curriculumWeeks.length > 0
      ? `Linked curriculum provides ${curriculumWeeks.length} week entries for this term.`
      : 'No term weeks were found in the linked curriculum, so policy defaults will drive the route length.',
  });
  checks.push({
    key: 'policy_defaults',
    label: 'Progression policy present',
    status: Object.keys(policy).length > 0 ? 'pass' : 'warn',
    detail: Object.keys(policy).length > 0
      ? 'Program progression policy is available for runtime defaults.'
      : 'No program progression policy was found, so fallback defaults will be used.',
  });
  checks.push({
    key: 'registry_primary_track',
    label: 'Primary track seeds',
    status: primaryTrackRows.length > 0 ? 'pass' : fallbackTrackRows.length > 0 ? 'warn' : 'fail',
    detail: primaryTrackRows.length > 0
      ? `${primaryTrackRows.length} seeded rows match the primary track "${primaryTrack}".`
      : fallbackTrackRows.length > 0
        ? `No direct "${primaryTrack}" seeds were found. Generation will rely on fallback tracks: ${trackCandidates.filter((track) => track !== primaryTrack).join(', ')}.`
        : `No seeded registry rows were found for track candidates: ${trackCandidates.join(', ')}.`,
    blocking: primaryTrackRows.length === 0 && fallbackTrackRows.length === 0,
  });
  checks.push({
    key: 'registry_filtered_pool',
    label: 'Usable route pool',
    status: registryFiltered.length >= effectiveWeeksCount ? 'pass' : registryFiltered.length > 0 ? 'warn' : 'fail',
    detail: registryFiltered.length >= effectiveWeeksCount
      ? `${registryFiltered.length} registry rows are usable for the requested ${effectiveWeeksCount}-week scope.`
      : registryFiltered.length > 0
        ? `Only ${registryFiltered.length} usable rows are available for ${effectiveWeeksCount} requested weeks. Repetition may increase.`
        : 'No usable registry rows remain after applying grade and policy filters.',
    blocking: registryFiltered.length === 0,
  });
  checks.push({
    key: 'essential_routes_only',
    label: 'Essential route metadata',
    status: essentialRoutesOnly
      ? registryFiltered.every((row) => hasStructuredProgressionMetadata(asObject(row.metadata))) ? 'pass' : 'fail'
      : 'pass',
    detail: essentialRoutesOnly
      ? 'Essential-only mode is active, so only registry rows with structured progression metadata can be used.'
      : 'Essential-only mode is off, so legacy registry rows can still support generation.',
    blocking: essentialRoutesOnly && registryFiltered.some((row) => !hasStructuredProgressionMetadata(asObject(row.metadata))),
  });
  checks.push({
    key: 'term_length_alignment',
    label: 'Week rhythm alignment',
    status: curriculumWeeks.length > 0 && curriculumWeeks.length !== effectiveWeeksCount ? 'warn' : 'pass',
    detail: curriculumWeeks.length > 0 && curriculumWeeks.length !== effectiveWeeksCount
      ? `Requested route length is ${effectiveWeeksCount} week(s), while the linked curriculum defines ${curriculumWeeks.length}.`
      : `Route length is aligned to ${effectiveWeeksCount} week(s).`,
  });

  const summary = checks.reduce(
    (acc, check) => {
      acc[check.status] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 },
  );
  const blocking = checks.some((check) => check.status === 'fail' && check.blocking);
  return {
    status: blocking ? 'blocked' : summary.warn > 0 || summary.fail > 0 ? 'warning' : 'ready',
    blocking,
    checks,
    summary,
  };
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
  totalWeeks: number;
  masteryMode: 'strict' | 'soft';
  curriculumWeeks?: ReturnType<typeof getSyllabusTermWeeks>;
  projectBased: boolean;
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
    totalWeeks,
    masteryMode,
    curriculumWeeks = [],
    projectBased,
  } = input;
  return selected.map(({ project, isRepeat }, idx) => {
    const week = startWeekNumber + idx;
    const assignmentTitle = `${project.title} - Weekly Practical`;
    const projectTitle = projectBased ? `${project.title} - Studio Build` : `${project.title} - Guided Practice`;
    const projectDescription = projectBased
      ? `Build a practical project around ${project.title} and present your implementation steps.`
      : `Guide learners through structured applied practice around ${project.title} with lighter project emphasis.`;
    const projectDeliverables = projectBased
      ? [
          'Working build output',
          'Short build notes',
          'Class presentation/demo',
        ]
      : [
          'Worked activity output',
          'Short reflection on the concept',
          'Teacher-reviewed classwork evidence',
        ];
    const canonical = buildCanonicalWeekShape({
      weekNumber: week,
      totalWeeks,
      topic: project.title,
      subtopics: project.concept_tags ?? [],
      assignmentTitle,
      projectTitle,
      projectDescription,
      projectDeliverables,
      classworkPrompt: project.classwork_prompt ?? `Build and present: ${project.title}`,
      estimatedMinutes: project.estimated_minutes ?? 45,
      conceptTags: project.concept_tags ?? [],
      curriculumWeek: curriculumWeeks.find((entry) => entry.week === week) ?? null,
    });
    return {
      week,
      type: canonical.type,
      topic: canonical.topic,
      subtopics: canonical.subtopics,
      mastery_mode: masteryMode,
      gating_state: idx === 0 ? 'unlocked' : 'locked',
      project_id: project.id,
      project_key: project.project_key,
      track,
      delivery_mode: deliveryMode,
      sessions_per_week: sessionsPerWeek,
      ai_module: aiModule,
      practical_focus: projectBased,
      repeated_project: isRepeat,
      concept_tags: project.concept_tags ?? [],
      difficulty_level: project.difficulty_level ?? null,
      objectives: canonical.objectivesText,
      objective_items: canonical.objectiveItems,
      activities: canonical.activitiesText,
      notes: canonical.notesText,
      lesson_plan: canonical.lessonPlan,
      assessment_plan: canonical.assessmentPlan,
      syllabus_week_type: canonical.type,
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
        description: projectDescription,
        deliverables: projectDeliverables,
        demo_required: projectBased,
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
        canonical_week_type: canonical.type,
        project_based_default: projectBased,
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
      classes(name),
      curriculum:course_curricula!fk_lesson_plans_curriculum(content)
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
  if (!plan.course_id) {
    return NextResponse.json({ error: 'Lesson plan is missing course context.' }, { status: 422 });
  }
  const courseId = plan.course_id;
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
  const syllabusPhase = resolveSyllabusPhaseFromClassName(plan.classes?.name);
  const trackFromPolicy = resolveDefaultTrackFromPolicy(policy, plan.classes?.name);
  const requestedTrack = typeof body.track === 'string' ? body.track : null;
  const track = requestedTrack ?? trackFromPolicy;
  const trackCandidates = normalizeTrackCandidates(track, policy);
  const gradeKey = resolveGradeKeyFromClassName(plan.classes?.name);
  const deliveryMode = (typeof body.delivery_mode === 'string' ? body.delivery_mode : null) ?? (program.delivery_type === 'optional' ? 'optional' : 'compulsory');
  const projectBasedDefault = typeof policy.project_based_default === 'boolean' ? policy.project_based_default : true;
  const projectBased = typeof body.project_based === 'boolean' ? body.project_based : projectBasedDefault;
  const essentialRoutesOnly = typeof policy.essential_routes_only === 'boolean' ? policy.essential_routes_only : false;
  const sessionsPerWeek =
    body.weekly_frequency === 2 || body.weekly_frequency === 1
      ? body.weekly_frequency
      : (program.session_frequency_per_week === 2 ? 2 : (plan.sessions_per_week === 2 ? 2 : 1));
  const curriculumContent = plan.curriculum?.content ?? null;
  const currentTermWeeks = getSyllabusTermWeeks(curriculumContent, termNumber);
  const requestedWeeksCount = Number(body.weeks_count);
  const policyDefaultWeeks = Number(policy.standard_weeks_per_term ?? 8);
  const weeksCount =
    Number.isFinite(requestedWeeksCount)
      ? Math.max(1, requestedWeeksCount)
      : currentTermWeeks.length > 0
        ? currentTermWeeks.length
        : Math.max(1, Number.isFinite(policyDefaultWeeks) ? policyDefaultWeeks : 8);
  const effectiveWeeksCount = requestedScope === 'week' ? 1 : weeksCount;

  const { data: registryRows, error: regErr } = await supabase
    .from('curriculum_project_registry')
    .select('id, school_id, project_key, title, track, concept_tags, difficulty_level, classwork_prompt, estimated_minutes, metadata')
    .eq('is_active', true)
    .eq('program_id', program.id)
    .or(`school_id.eq.${schoolId},school_id.is.null`)
    .in('track', trackCandidates);

  if (regErr) return NextResponse.json({ error: regErr.message }, { status: 500 });
  const registryAll = sortRegistryRows((registryRows ?? []) as ProjectRow[], trackCandidates);
  const registryGradeAligned = gradeKey
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
  const registry = essentialRoutesOnly
    ? registryGradeAligned.filter((row) => hasStructuredProgressionMetadata(asObject(row.metadata)))
    : registryGradeAligned;
  const preflight = buildPreflight({
    className: plan.classes?.name ?? null,
    gradeKey,
    curriculumWeeks: currentTermWeeks,
    program,
    policy,
    registryAll,
    registryFiltered: registry,
    primaryTrack: track,
    trackCandidates,
    effectiveWeeksCount,
    essentialRoutesOnly,
  });
  if (preflight.blocking && !dryRun) {
    return NextResponse.json({
      error: 'Progression preflight failed. Resolve the blocking readiness issues before generating.',
      preflight,
    }, { status: 422 });
  }
  if (registry.length === 0 && dryRun) {
    return NextResponse.json({
      data: {
        dry_run: true,
        lesson_plan_id: id,
        scope: fullProgram || requestedScope === 'full_program' ? 'full_program' : requestedScope,
        track,
        grade_key: gradeKey,
        delivery_mode: deliveryMode,
        sessions_per_week: sessionsPerWeek,
        strict_route: strictRoute,
        project_based: projectBased,
        essential_routes_only: essentialRoutesOnly,
        auto_flashcards: false,
        projected_terms: [],
        projected_assignments: 0,
        projected_projects: 0,
        projected_flashcard_decks: 0,
        repeated_weeks: 0,
        repetition_risk: 'high',
        warnings: ['Preflight blocked generation before route preview could be built.'],
        week_number: requestedScope === 'week' ? weekNumber : null,
        preflight,
        policy_runtime: {
          strict_route: strictRoute,
          project_based: projectBased,
          essential_routes_only: essentialRoutesOnly,
          track_candidates: trackCandidates,
          standard_weeks_per_term: weeksCount,
        },
      },
    });
  }

  const cutoffYear = Math.max(1, yearNumber - 2);
  const { data: usageRows, error: usageErr } = await supabase
    .from('curriculum_project_usage')
    .select('project_id')
    .eq('school_id', schoolId)
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
      totalWeeks: effectiveWeeksCount,
      masteryMode,
      curriculumWeeks: getSyllabusTermWeeks(curriculumContent, termNo),
      projectBased,
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
      project_based: projectBased,
      essential_routes_only: essentialRoutesOnly,
      track,
      track_candidates: trackCandidates,
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
        project_based: projectBased,
        essential_routes_only: essentialRoutesOnly,
        preflight,
        policy_runtime: {
          strict_route: strictRoute,
          project_based: projectBased,
          essential_routes_only: essentialRoutesOnly,
          track_candidates: trackCandidates,
          standard_weeks_per_term: weeksCount,
        },
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
      course_id: courseId,
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
        project_based: projectBased,
        essential_routes_only: essentialRoutesOnly,
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
  if (desiredWorkItems.length > 0) {
    const { data: existingWorkRows, error: existingWorkErr } = await supabase
      .from('assignments')
      .select('id, assignment_type, metadata')
      .eq('school_id', schoolId)
      .eq('course_id', courseId);
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
          course_id: courseId,
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

  if (autoFlashcards) {
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
      .eq('course_id', courseId);
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
          course_id: courseId,
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
      const objectiveText = deckDef.week.objective_items.join(' | ') || deckDef.week.objectives;
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
      project_based: projectBased,
      essential_routes_only: essentialRoutesOnly,
      preflight,
      policy_runtime: {
        strict_route: strictRoute,
        project_based: projectBased,
        essential_routes_only: essentialRoutesOnly,
        track_candidates: trackCandidates,
        standard_weeks_per_term: weeksCount,
      },
    },
  });
}
