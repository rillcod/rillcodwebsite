import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/types/supabase';

type WeekPerformanceInsert = Database['public']['Tables']['curriculum_week_performance']['Insert'];

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role, school_id')
    .eq('id', user.id)
    .single();
  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const week = Number(new URL(req.url).searchParams.get('week_number') || 0);

  let query = supabase
    .from('curriculum_week_performance')
    .select('week_number, practical_score, completion_seconds, retry_count, completed, student_id')
    .eq('lesson_plan_id', id);

  if (week > 0) query = query.eq('week_number', week);
  if (profile.role === 'school' && profile.school_id) query = query.eq('school_id', profile.school_id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const total = rows.length;
  const avgScore = total > 0 ? rows.reduce((s, r) => s + Number(r.practical_score ?? 0), 0) / total : 0;
  const avgTime = total > 0 ? rows.reduce((s, r) => s + Number(r.completion_seconds ?? 0), 0) / total : 0;
  const avgRetry = total > 0 ? rows.reduce((s, r) => s + Number(r.retry_count ?? 0), 0) / total : 0;
  const completionRate = total > 0 ? (rows.filter((r) => r.completed).length / total) * 100 : 0;

  return NextResponse.json({
    data: rows,
    summary: {
      total_records: total,
      average_practical_score: Number(avgScore.toFixed(2)),
      average_completion_seconds: Math.round(avgTime),
      average_retry_count: Number(avgRetry.toFixed(2)),
      completion_rate: Number(completionRate.toFixed(2)),
    },
  });
}

export async function POST(
  req: NextRequest,
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
  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const {
    student_id,
    week_number,
    year_number = 1,
    term_number = 1,
    practical_score = 0,
    completion_seconds = 0,
    retry_count = 0,
    completed = false,
  } = await req.json();

  if (!student_id || !week_number) {
    return NextResponse.json({ error: 'student_id and week_number are required.' }, { status: 400 });
  }

  const { data: plan } = await supabase
    .from('lesson_plans')
    .select('id, school_id, course_id, class_id')
    .eq('id', id)
    .single();
  if (!plan) return NextResponse.json({ error: 'Lesson plan not found.' }, { status: 404 });
  if (!plan.school_id) return NextResponse.json({ error: 'Lesson plan missing school scope.' }, { status: 422 });
  if (profile.role === 'school' && profile.school_id !== plan.school_id) {
    return NextResponse.json({ error: 'Forbidden for this school scope.' }, { status: 403 });
  }

  const payload: WeekPerformanceInsert = {
    school_id: plan.school_id,
    lesson_plan_id: id,
    course_id: plan.course_id,
    class_id: plan.class_id,
    student_id,
    year_number: Number(year_number),
    term_number: Number(term_number),
    week_number: Number(week_number),
    practical_score: Number(practical_score),
    completion_seconds: Number(completion_seconds),
    retry_count: Number(retry_count),
    completed: Boolean(completed),
    recorded_by: user.id,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('curriculum_week_performance')
    .upsert(payload, {
      onConflict: 'student_id,lesson_plan_id,year_number,term_number,week_number',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
