import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

type PerformanceRow = {
  lesson_plan_id: string;
  class_id: string | null;
  course_id: string | null;
  student_id: string;
  year_number: number;
  term_number: number;
  week_number: number;
  practical_score: number;
  retry_count: number;
  completed: boolean;
};

type LessonPlanRow = {
  id: string;
  class_id: string | null;
  course_id: string | null;
  sessions_per_week: number | null;
  plan_data: Record<string, unknown> | null;
  courses?: { title?: string | null } | null;
  classes?: { name?: string | null } | null;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getTrackFromPlan(plan: LessonPlanRow | null, year: number, term: number): string | null {
  if (!plan?.plan_data) return null;
  const progression = asObject(asObject(plan.plan_data).progression);
  const generatedTerms = asObject(progression.generated_terms);
  const key = `y${year}t${term}`;
  const termObj = asObject(generatedTerms[key]);
  return typeof termObj.track === 'string' ? termObj.track : null;
}

function getTopicFromPlan(plan: LessonPlanRow | null, year: number, term: number, week: number): string {
  if (!plan?.plan_data) return `Week ${week}`;
  const progression = asObject(asObject(plan.plan_data).progression);
  const generatedTerms = asObject(progression.generated_terms);
  const key = `y${year}t${term}`;
  const termObj = asObject(generatedTerms[key]);
  const weeks = Array.isArray(termObj.weeks) ? (termObj.weeks as Array<Record<string, unknown>>) : [];
  const hit = weeks.find((w) => Number(w.week ?? -1) === week);
  if (!hit) return `Week ${week}`;
  return typeof hit.topic === 'string' ? hit.topic : `Week ${week}`;
}

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role, school_id')
    .eq('id', user.id)
    .single();
  if (!profile || !['admin', 'teacher'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Teacher or admin access required.' }, { status: 403 });
  }

  const url = new URL(req.url);
  const year = Number(url.searchParams.get('year_number') ?? 0);
  const term = Number(url.searchParams.get('term_number') ?? 0);
  const classId = url.searchParams.get('class_id');
  const courseId = url.searchParams.get('course_id');
  const track = url.searchParams.get('track');
  const deliveryMode = url.searchParams.get('delivery_mode');
  const frequency = Number(url.searchParams.get('frequency') ?? 0);

  let perfQuery = supabase
    .from('curriculum_week_performance')
    .select('lesson_plan_id,class_id,course_id,student_id,year_number,term_number,week_number,practical_score,retry_count,completed');

  if (profile.school_id) perfQuery = perfQuery.eq('school_id', profile.school_id);
  if (year > 0) perfQuery = perfQuery.eq('year_number', year);
  if (term > 0) perfQuery = perfQuery.eq('term_number', term);
  if (classId) perfQuery = perfQuery.eq('class_id', classId);
  if (courseId) perfQuery = perfQuery.eq('course_id', courseId);

  const { data: perfRowsRaw, error: perfErr } = await perfQuery;
  if (perfErr) return NextResponse.json({ error: perfErr.message }, { status: 500 });
  const perfRows = (perfRowsRaw ?? []) as PerformanceRow[];
  if (perfRows.length === 0) {
    return NextResponse.json({
      data: {
        summary: {
          completion_pct: 0,
          average_practical_score: 0,
          average_retry_count: 0,
          total_records: 0,
        },
        class_breakdown: [],
        student_breakdown: [],
        weak_topic_heatmap: [],
      },
    });
  }

  const lessonPlanIds = Array.from(new Set(perfRows.map((r) => r.lesson_plan_id)));
  const { data: plansRaw, error: plansErr } = await supabase
    .from('lesson_plans')
    .select('id,class_id,course_id,sessions_per_week,plan_data,courses(title),classes(name)')
    .in('id', lessonPlanIds);
  if (plansErr) return NextResponse.json({ error: plansErr.message }, { status: 500 });
  const plans = (plansRaw ?? []) as LessonPlanRow[];
  const plansById = new Map(plans.map((p) => [p.id, p]));

  const filteredRows = perfRows.filter((r) => {
    const plan = plansById.get(r.lesson_plan_id) ?? null;
    if (track) {
      const rowTrack = getTrackFromPlan(plan, r.year_number, r.term_number);
      if (rowTrack !== track) return false;
    }
    if (deliveryMode) {
      const progression = asObject(asObject(plan?.plan_data).progression);
      const generatedTerms = asObject(progression.generated_terms);
      const termObj = asObject(generatedTerms[`y${r.year_number}t${r.term_number}`]);
      const mode = typeof termObj.delivery_mode === 'string' ? termObj.delivery_mode : null;
      if (mode !== deliveryMode) return false;
    }
    if (frequency > 0) {
      const freq = plan?.sessions_per_week ?? 1;
      if (freq !== frequency) return false;
    }
    return true;
  });

  const total = filteredRows.length;
  const completionCount = filteredRows.filter((r) => r.completed).length;
  const avgScore = total > 0 ? filteredRows.reduce((sum, r) => sum + Number(r.practical_score ?? 0), 0) / total : 0;
  const avgRetry = total > 0 ? filteredRows.reduce((sum, r) => sum + Number(r.retry_count ?? 0), 0) / total : 0;

  const classAgg = new Map<string, { class_id: string | null; class_name: string; total: number; completed: number; scoreSum: number; retrySum: number }>();
  const studentAgg = new Map<string, { student_id: string; total: number; completed: number; scoreSum: number; retrySum: number }>();
  const topicAgg = new Map<string, { topic: string; total: number; scoreSum: number; retrySum: number; completed: number }>();

  for (const row of filteredRows) {
    const plan = plansById.get(row.lesson_plan_id) ?? null;
    const className = plan?.classes?.name ?? 'Unknown Class';
    const classKey = row.class_id ?? `plan:${row.lesson_plan_id}`;
    const existingClass = classAgg.get(classKey) ?? {
      class_id: row.class_id,
      class_name: className,
      total: 0,
      completed: 0,
      scoreSum: 0,
      retrySum: 0,
    };
    existingClass.total += 1;
    existingClass.completed += row.completed ? 1 : 0;
    existingClass.scoreSum += Number(row.practical_score ?? 0);
    existingClass.retrySum += Number(row.retry_count ?? 0);
    classAgg.set(classKey, existingClass);

    const existingStudent = studentAgg.get(row.student_id) ?? {
      student_id: row.student_id,
      total: 0,
      completed: 0,
      scoreSum: 0,
      retrySum: 0,
    };
    existingStudent.total += 1;
    existingStudent.completed += row.completed ? 1 : 0;
    existingStudent.scoreSum += Number(row.practical_score ?? 0);
    existingStudent.retrySum += Number(row.retry_count ?? 0);
    studentAgg.set(row.student_id, existingStudent);

    const topic = getTopicFromPlan(plan, row.year_number, row.term_number, row.week_number);
    const existingTopic = topicAgg.get(topic) ?? {
      topic,
      total: 0,
      scoreSum: 0,
      retrySum: 0,
      completed: 0,
    };
    existingTopic.total += 1;
    existingTopic.scoreSum += Number(row.practical_score ?? 0);
    existingTopic.retrySum += Number(row.retry_count ?? 0);
    existingTopic.completed += row.completed ? 1 : 0;
    topicAgg.set(topic, existingTopic);
  }

  const classBreakdown = Array.from(classAgg.values()).map((c) => ({
    class_id: c.class_id,
    class_name: c.class_name,
    completion_pct: c.total > 0 ? Number(((c.completed / c.total) * 100).toFixed(2)) : 0,
    average_practical_score: c.total > 0 ? Number((c.scoreSum / c.total).toFixed(2)) : 0,
    average_retry_count: c.total > 0 ? Number((c.retrySum / c.total).toFixed(2)) : 0,
    total_records: c.total,
  })).sort((a, b) => a.class_name.localeCompare(b.class_name));

  const studentBreakdown = Array.from(studentAgg.values()).map((s) => ({
    student_id: s.student_id,
    completion_pct: s.total > 0 ? Number(((s.completed / s.total) * 100).toFixed(2)) : 0,
    average_practical_score: s.total > 0 ? Number((s.scoreSum / s.total).toFixed(2)) : 0,
    average_retry_count: s.total > 0 ? Number((s.retrySum / s.total).toFixed(2)) : 0,
    total_records: s.total,
  })).sort((a, b) => a.average_practical_score - b.average_practical_score).slice(0, 20);

  const weakTopicHeatmap = Array.from(topicAgg.values()).map((t) => {
    const avgTopicScore = t.total > 0 ? t.scoreSum / t.total : 0;
    const avgRetryCount = t.total > 0 ? t.retrySum / t.total : 0;
    const completionPct = t.total > 0 ? (t.completed / t.total) * 100 : 0;
    const weaknessIndex = Number((Math.max(0, 100 - avgTopicScore) + avgRetryCount * 5 + Math.max(0, 100 - completionPct) * 0.3).toFixed(2));
    return {
      topic: t.topic,
      average_practical_score: Number(avgTopicScore.toFixed(2)),
      average_retry_count: Number(avgRetryCount.toFixed(2)),
      completion_pct: Number(completionPct.toFixed(2)),
      weakness_index: weaknessIndex,
      total_records: t.total,
    };
  }).sort((a, b) => b.weakness_index - a.weakness_index).slice(0, 25);

  return NextResponse.json({
    data: {
      summary: {
        completion_pct: total > 0 ? Number(((completionCount / total) * 100).toFixed(2)) : 0,
        average_practical_score: Number(avgScore.toFixed(2)),
        average_retry_count: Number(avgRetry.toFixed(2)),
        total_records: total,
      },
      class_breakdown: classBreakdown,
      student_breakdown: studentBreakdown,
      weak_topic_heatmap: weakTopicHeatmap,
    },
  });
}
