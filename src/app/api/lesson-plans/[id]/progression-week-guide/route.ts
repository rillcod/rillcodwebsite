import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
  resolveDefaultTrackFromPolicy,
  resolveGradeKeyFromClassName,
  resolveSyllabusPhaseFromClassName,
} from '@/lib/progression/lessonPlanProgressionContext';

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

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

function metadataProgressTuple(m: Record<string, unknown>): [number, number, number, number] {
  return [
    Number(m.year_number ?? 0) || 0,
    Number(m.term_number ?? 0) || 0,
    Number(m.week_number ?? 0) || 0,
    Number(m.week_index ?? 0) || 0,
  ];
}

function compareTuples(a: [number, number, number, number], b: [number, number, number, number]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json({ error: 'Only teacher or admin can view the progression week guide.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const yearFilter = searchParams.get('year_number');
  const termFilter = searchParams.get('term_number');
  const trackOverride = searchParams.get('track');
  const gradeKeyOverride = searchParams.get('grade_key');

  const { data: planDataRaw, error: planErr } = await supabase
    .from('lesson_plans')
    .select(`
      id,
      school_id,
      class_id,
      course_id,
      courses(
        id,
        program_id,
        programs(
          id,
          name,
          program_scope,
          school_progression_enabled,
          progression_policy
        )
      ),
      classes(name)
    `)
    .eq('id', id)
    .single();

  if (planErr || !planDataRaw) {
    return NextResponse.json({ error: 'Lesson plan not found.' }, { status: 404 });
  }

  const plan = planDataRaw as {
    id: string;
    school_id: string | null;
    courses: {
      program_id: string | null;
      programs: {
        id: string;
        name: string | null;
        program_scope: string | null;
        school_progression_enabled: boolean | null;
        progression_policy: unknown;
      } | null;
    } | null;
    classes: { name: string | null } | null;
  };

  if (!plan.school_id) {
    return NextResponse.json({ error: 'Lesson plan is missing school context.' }, { status: 422 });
  }
  if (profile.role !== 'admin' && plan.school_id !== profile.school_id) {
    return NextResponse.json({ error: 'You can only view guides for your school lesson plans.' }, { status: 403 });
  }

  const program = plan.courses?.programs;
  if (!program || program.program_scope !== 'regular_school' || program.school_progression_enabled !== true) {
    return NextResponse.json(
      {
        error:
          'Week-by-week guide is only available for regular_school programs with school progression enabled.',
      },
      { status: 422 },
    );
  }

  const policy = asObject(program.progression_policy);
  const className = plan.classes?.name;
  const inferredGradeKey = resolveGradeKeyFromClassName(className);
  const gradeKey =
    typeof gradeKeyOverride === 'string' && /^[a-z0-9_]+$/i.test(gradeKeyOverride.trim())
      ? gradeKeyOverride.trim().toLowerCase()
      : inferredGradeKey;
  const syllabusPhase = resolveSyllabusPhaseFromClassName(className);
  const trackFromPolicy = resolveDefaultTrackFromPolicy(policy, className);
  const track = (trackOverride && trackOverride.trim()) || trackFromPolicy;

  const { data: registryRows, error: regErr } = await supabase
    .from('curriculum_project_registry')
    .select('id, school_id, project_key, title, track, concept_tags, difficulty_level, classwork_prompt, estimated_minutes, metadata')
    .eq('is_active', true)
    .eq('program_id', program.id)
    .or(`school_id.eq.${plan.school_id},school_id.is.null`)
    .in('track', [track, 'mixed']);

  if (regErr) return NextResponse.json({ error: regErr.message }, { status: 500 });

  const registryAll = (registryRows ?? []) as ProjectRow[];

  const gradeKeyed = gradeKey
    ? registryAll.filter((p) => asObject(p.metadata).grade_key === gradeKey)
    : [];

  const legacyOnly = registryAll.filter((p) => !asObject(p.metadata).grade_key);

  let pool: ProjectRow[];
  if (gradeKey) {
    if (gradeKeyed.length === 0) {
      return NextResponse.json(
        {
          error: `No seeded guide rows for grade "${gradeKey}" and track "${track}". Run grade progression seeds or pick another track in programme policy.`,
        },
        { status: 422 },
      );
    }
    pool = gradeKeyed;
  } else {
    pool = legacyOnly;
    if (pool.length === 0) {
      return NextResponse.json(
        {
          error:
            'Set the class name (e.g. Basic 4, JSS 2) on this plan, or pass grade_key=basic_4 (etc.) in the URL, to load the week-by-week guide.',
        },
        { status: 422 },
      );
    }
  }

  const sorted = [...pool].sort((a, b) => {
    const ma = asObject(a.metadata);
    const mb = asObject(b.metadata);
    const cmp = compareTuples(metadataProgressTuple(ma), metadataProgressTuple(mb));
    if (cmp !== 0) return cmp;
    return (a.difficulty_level ?? 0) - (b.difficulty_level ?? 0);
  });

  let weeks = sorted.map((row, idx) => {
    const m = asObject(row.metadata);
    return {
      sequence: idx + 1,
      project_key: row.project_key,
      title: row.title,
      track: row.track,
      concept_tags: row.concept_tags ?? [],
      difficulty_level: row.difficulty_level,
      classwork_prompt: row.classwork_prompt,
      estimated_minutes: row.estimated_minutes,
      year_number: Number.isFinite(Number(m.year_number)) ? Number(m.year_number) : null,
      term_number: Number.isFinite(Number(m.term_number)) ? Number(m.term_number) : null,
      week_number: Number.isFinite(Number(m.week_number)) ? Number(m.week_number) : null,
      week_index: Number.isFinite(Number(m.week_index)) ? Number(m.week_index) : null,
      grade_key: typeof m.grade_key === 'string' ? m.grade_key : null,
      syllabus_phase: typeof m.syllabus_phase === 'string' ? m.syllabus_phase : null,
    };
  });

  if (yearFilter !== null && yearFilter !== '') {
    const y = Number(yearFilter);
    if (Number.isFinite(y)) weeks = weeks.filter((w) => w.year_number === y);
  }
  if (termFilter !== null && termFilter !== '') {
    const t = Number(termFilter);
    if (Number.isFinite(t)) weeks = weeks.filter((w) => w.term_number === t);
  }

  return NextResponse.json({
    data: {
      lesson_plan_id: plan.id,
      class_name: className,
      grade_key: gradeKey,
      grade_key_source:
        typeof gradeKeyOverride === 'string' && gradeKeyOverride.trim()
          ? 'query_override'
          : 'class_name',
      track,
      syllabus_phase: syllabusPhase,
      program_id: program.id,
      program_name: program.name,
      source: gradeKey ? 'grade_specific_registry' : 'legacy_registry_no_grade_key',
      weeks_count: weeks.length,
      weeks,
    },
  });
}
