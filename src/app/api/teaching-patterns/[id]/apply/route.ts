import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { requireGovernanceActor } from '@/lib/curriculum/governance-server';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await requireGovernanceActor();
  if (!actor || actor.role !== 'teacher') {
    return NextResponse.json({ error: 'Teacher access required.' }, { status: 403 });
  }
  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));
  const planIds = Array.from(new Set(
    (Array.isArray(body.lesson_plan_ids) ? body.lesson_plan_ids : [])
      .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0),
  )).slice(0, 50);
  if (planIds.length === 0) {
    return NextResponse.json({ error: 'Choose at least one assigned class plan.' }, { status: 400 });
  }

  const db: any = createAdminClient();
  const { data: pattern } = await db.from('teacher_delivery_patterns').select('*').eq('id', id).eq('teacher_id', actor.id).eq('status', 'active').maybeSingle();
  if (!pattern) return NextResponse.json({ error: 'Teaching pattern not found.' }, { status: 404 });
  const schoolIds = await getTeacherSchoolIds(actor.id, actor.school_id);
  const { data: plans } = await db
    .from('lesson_plans')
    .select('id, school_id, class_id, plan_data, classes!lesson_plans_class_id_fkey(teacher_id)')
    .in('id', planIds);
  const eligible = (plans ?? []).filter((plan: any) => {
    const klass = Array.isArray(plan.classes) ? plan.classes[0] : plan.classes;
    return klass?.teacher_id === actor.id && schoolIds.includes(plan.school_id);
  });

  for (const plan of eligible) {
    const current = plan.plan_data && typeof plan.plan_data === 'object' && !Array.isArray(plan.plan_data) ? plan.plan_data : {};
    const appliedAt = new Date().toISOString();
    await db.from('lesson_plans').update({
      plan_data: {
        ...current,
        teacher_delivery_pattern: {
          pattern_id: pattern.id,
          name: pattern.name,
          content: pattern.content,
          applied_at: appliedAt,
        },
      },
      updated_at: appliedAt,
    }).eq('id', plan.id);
    await db.from('lesson_plan_pattern_applications').upsert({
      pattern_id: pattern.id,
      lesson_plan_id: plan.id,
      pattern_snapshot: pattern.content,
      applied_by: actor.id,
      applied_at: appliedAt,
    }, { onConflict: 'pattern_id,lesson_plan_id' });
  }

  return NextResponse.json({
    data: {
      applied_count: eligible.length,
      skipped_count: planIds.length - eligible.length,
      message: eligible.length === 1
        ? 'Teaching pattern applied to one class plan.'
        : `Teaching pattern applied to ${eligible.length} class plans.`,
    },
  });
}
