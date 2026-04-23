import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { buildLessonPlanSyllabusQa } from '@/lib/progression/syllabusQa';

export async function GET(
  _req: Request,
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
    return NextResponse.json({ error: 'Teacher or admin access required.' }, { status: 403 });
  }

  const { data: plan, error: planErr } = await supabase
    .from('lesson_plans')
    .select(`
      id,
      school_id,
      plan_data,
      curriculum:course_curricula!fk_lesson_plans_curriculum(content),
      courses(
        programs(
          progression_policy
        )
      )
    `)
    .eq('id', id)
    .single();

  if (planErr || !plan) {
    return NextResponse.json({ error: 'Lesson plan not found.' }, { status: 404 });
  }
  if (profile.role !== 'admin' && plan.school_id !== profile.school_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const report = buildLessonPlanSyllabusQa({
    planData: plan.plan_data,
    curriculum: (plan.curriculum as { content?: unknown } | null)?.content as any,
    policy: ((plan.courses as { programs?: { progression_policy?: Record<string, unknown> | null } | null } | null)?.programs?.progression_policy ?? null),
  });

  return NextResponse.json({
    data: {
      lesson_plan_id: id,
      ...report,
    },
  });
}
