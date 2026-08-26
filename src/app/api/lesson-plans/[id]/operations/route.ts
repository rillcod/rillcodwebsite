import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractLessonPlanOperationWeeks } from '@/lib/progression/lessonPlanOperation';
import { canAccessLessonScope } from '@/app/api/lesson-plans/authz';
import { buildLessonPlanReleaseBoard } from '@/lib/academic/lesson-plan-release-board';
import { summarizeTeachingGenerationRuns } from '@/lib/academic/tracked-week-generation';

export const dynamic = 'force-dynamic';

type Dict = Record<string, unknown>;
type LessonRow = {
  id: string;
  lesson_plan_id: string | null;
  curriculum_week_number: number | null;
  session_number: number | null;
  status: string | null;
  updated_at: string | null;
  metadata: Dict | null;
};
type AssignmentRow = {
  id: string;
  lesson_plan_id: string | null;
  curriculum_week_number: number | null;
  session_number: number | null;
  assignment_type: string | null;
  is_active: boolean | null;
  updated_at: string | null;
  metadata: Dict | null;
};
type PackageAssetRow = {
  id: string;
  curriculum_week_number: number | null;
  session_number: number | null;
  is_public: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  metadata: Dict | null;
};
type PerformanceRow = {
  year_number: number;
  term_number: number;
  week_number: number;
  practical_score: number | null;
  retry_count: number | null;
  completed: boolean | null;
};
type AuditRow = {
  id: string;
  action_type: string | null;
  actor_role: string | null;
  year_number: number | null;
  term_number: number | null;
  week_number: number | null;
  reason: string | null;
  created_at: string;
};

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: plan, error: planErr } = await supabase
    .from('lesson_plans')
    .select('id, school_id, created_by, plan_data, term_start, course_id, class_id, classes!lesson_plans_class_id_fkey(teacher_id)')
    .eq('id', id)
    .single();
  if (planErr || !plan) return NextResponse.json({ error: 'Lesson plan not found.' }, { status: 404 });
  if (profile.role !== 'admin') {
    const klass = Array.isArray((plan as any).classes) ? (plan as any).classes[0] : (plan as any).classes;
    if (!canAccessLessonScope(
      { id: user.id, role: profile.role, school_id: profile.school_id },
      {
        school_id: plan.school_id ?? null,
        created_by: (plan as any).created_by ?? null,
        class_id: plan.class_id ?? null,
        class_teacher_id: klass?.teacher_id ?? null,
      },
    )) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const weeks = extractLessonPlanOperationWeeks(plan.plan_data);

  const [
    scheduleRes,
    lessonsRes,
    slidesRes,
    flashcardsRes,
    assignmentsRes,
    performanceRes,
    auditRes,
  ] = await Promise.all([
    (supabase as any)
      .from('term_schedules')
      .select('id,lesson_plan_id,is_active,current_week,term_start,cadence_days,updated_at')
      .eq('lesson_plan_id', id)
      .maybeSingle(),
    plan.course_id
      ? (() => {
          let q = (supabase as any)
            .from('lessons')
            .select('id,lesson_plan_id,curriculum_week_number,session_number,status,updated_at,metadata')
            .eq('course_id', plan.course_id)
            .or(`lesson_plan_id.eq.${id},metadata->>lesson_plan_id.eq.${id}`);
          q = plan.school_id ? q.eq('school_id', plan.school_id) : q.is('school_id', null);
          return q;
        })()
      : Promise.resolve({ data: [], error: null }),
    (supabase as any)
      .from('lesson_materials')
      .select('id,lesson_id,curriculum_week_number,session_number,is_public,created_at,metadata')
      .or(`lesson_plan_id.eq.${id},metadata->>lesson_plan_id.eq.${id}`)
      .eq('file_type', 'slide-deck'),
    (supabase as any)
      .from('flashcard_decks')
      .select('id,lesson_id,curriculum_week_number,session_number,is_public,updated_at,metadata')
      .or(`lesson_plan_id.eq.${id},metadata->>lesson_plan_id.eq.${id}`),
    plan.course_id
      ? (() => {
          let q = (supabase as any)
            .from('assignments')
            .select('id,lesson_plan_id,curriculum_week_number,session_number,assignment_type,is_active,updated_at,metadata')
            .eq('course_id', plan.course_id)
            .or(`lesson_plan_id.eq.${id},metadata->>lesson_plan_id.eq.${id}`);
          q = plan.school_id ? q.eq('school_id', plan.school_id) : q.is('school_id', null);
          return q;
        })()
      : Promise.resolve({ data: [], error: null }),
    (supabase as any)
      .from('curriculum_week_performance')
      .select('year_number,term_number,week_number,practical_score,retry_count,completed')
      .eq('lesson_plan_id', id),
    (supabase as any)
      .from('progression_override_audit')
      .select('id,action_type,actor_role,year_number,term_number,week_number,reason,created_at')
      .eq('lesson_plan_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  if (scheduleRes.error || lessonsRes.error || assignmentsRes.error || slidesRes.error || flashcardsRes.error || performanceRes.error || auditRes.error) {
    return NextResponse.json({
      error: scheduleRes.error?.message
        ?? lessonsRes.error?.message
        ?? assignmentsRes.error?.message
        ?? slidesRes.error?.message
        ?? flashcardsRes.error?.message
        ?? performanceRes.error?.message
        ?? auditRes.error?.message
        ?? 'Failed to load operations data.',
    }, { status: 500 });
  }

  const lessonRows = (lessonsRes.data ?? []) as LessonRow[];
  const assignmentRows = (assignmentsRes.data ?? []) as AssignmentRow[];
  const slideRows = (slidesRes.data ?? []) as PackageAssetRow[];
  const flashcardRows = (flashcardsRes.data ?? []) as PackageAssetRow[];
  const performanceRows = (performanceRes.data ?? []) as PerformanceRow[];
  const auditRows = (auditRes.data ?? []) as AuditRow[];

  const releaseBoard = buildLessonPlanReleaseBoard({
    planWeeks: weeks,
    lessons: lessonRows,
    assignments: assignmentRows.filter((row) => row.assignment_type !== 'project'),
    projects: assignmentRows.filter((row) => row.assignment_type === 'project'),
    slideDecks: slideRows,
    flashcardDecks: flashcardRows,
  });
  const trackingDb = createAdminClient() as any;
  const generationRes = await trackingDb
    .from('teaching_generation_runs')
    .select('status,curriculum_week_number,session_number,failed_types,started_at,completed_at')
    .eq('lesson_plan_id', id)
    .order('started_at', { ascending: false })
    .limit(20);
  if (generationRes.error && !['42P01', '42703'].includes(generationRes.error.code ?? '')) {
    console.warn('[lesson-plan-operations] generation tracking unavailable', {
      code: generationRes.error.code ?? null,
      planId: id,
    });
  }
  const generationSummary = summarizeTeachingGenerationRuns(
    generationRes.data ?? [],
    !generationRes.error,
  );

  const analyticsSummary = (() => {
    const total = performanceRows.length;
    const completed = performanceRows.filter((row) => row.completed).length;
    const avgScore = total > 0
      ? performanceRows.reduce((sum, row) => sum + Number(row.practical_score ?? 0), 0) / total
      : 0;
    const avgRetry = total > 0
      ? performanceRows.reduce((sum, row) => sum + Number(row.retry_count ?? 0), 0) / total
      : 0;
    return {
      total_records: total,
      completion_pct: total > 0 ? Number(((completed / total) * 100).toFixed(2)) : 0,
      average_practical_score: Number(avgScore.toFixed(2)),
      average_retry_count: Number(avgRetry.toFixed(2)),
    };
  })();

  const analyticsTerms = Array.from(
    performanceRows.reduce((map, row) => {
      const key = `y${row.year_number}t${row.term_number}`;
      const current = map.get(key) ?? {
        key,
        year_number: row.year_number,
        term_number: row.term_number,
        total: 0,
        completed: 0,
        score_sum: 0,
        retry_sum: 0,
      };
      current.total += 1;
      current.completed += row.completed ? 1 : 0;
      current.score_sum += Number(row.practical_score ?? 0);
      current.retry_sum += Number(row.retry_count ?? 0);
      map.set(key, current);
      return map;
    }, new Map<string, {
      key: string;
      year_number: number;
      term_number: number;
      total: number;
      completed: number;
      score_sum: number;
      retry_sum: number;
    }>()),
  ).map(([, entry]) => ({
    key: entry.key,
    year_number: entry.year_number,
    term_number: entry.term_number,
    total_records: entry.total,
    completion_pct: entry.total > 0 ? Number(((entry.completed / entry.total) * 100).toFixed(2)) : 0,
    average_practical_score: entry.total > 0 ? Number((entry.score_sum / entry.total).toFixed(2)) : 0,
    average_retry_count: entry.total > 0 ? Number((entry.retry_sum / entry.total).toFixed(2)) : 0,
  })).sort((a, b) => a.year_number - b.year_number || a.term_number - b.term_number);

  const auditSummary = {
    total_events: auditRows.length,
    by_action: Array.from(
      auditRows.reduce((map, row) => {
        const key = row.action_type ?? 'unknown';
        map.set(key, (map.get(key) ?? 0) + 1);
        return map;
      }, new Map<string, number>()),
    ).map(([action_type, count]) => ({ action_type, count })),
    by_role: Array.from(
      auditRows.reduce((map, row) => {
        const key = row.actor_role ?? 'unknown';
        map.set(key, (map.get(key) ?? 0) + 1);
        return map;
      }, new Map<string, number>()),
    ).map(([actor_role, count]) => ({ actor_role, count })),
  };

  return NextResponse.json({
    data: {
      schedule: scheduleRes.data ?? null,
      release_board: releaseBoard,
      generation: generationSummary,
      analytics: {
        summary: analyticsSummary,
        terms: analyticsTerms,
      },
      audit: {
        summary: auditSummary,
        timeline: auditRows,
      },
    },
  });
}
