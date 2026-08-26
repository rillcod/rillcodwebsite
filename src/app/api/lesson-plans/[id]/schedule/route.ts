import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canAccessLessonScope } from '@/app/api/lesson-plans/authz';

export const dynamic = 'force-dynamic';

// POST /api/lesson-plans/[id]/schedule — activate the term scheduler for this plan
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { term_start, cadence_days } = await req.json();
  if (!term_start) return NextResponse.json({ error: 'term_start is required', field: 'term_start' }, { status: 400 });

  const { data: plan } = await supabase.from('lesson_plans')
    .select('id, school_id, class_id, created_by, classes!lesson_plans_class_id_fkey(teacher_id)')
    .eq('id', id).single();
  if (!plan) return NextResponse.json({ error: 'Lesson plan not found' }, { status: 404 });
  if (profile.role !== 'admin') {
    const klass = Array.isArray((plan as any).classes) ? (plan as any).classes[0] : (plan as any).classes;
    if (!canAccessLessonScope(
      { id: user.id, role: profile.role, school_id: profile.school_id },
      {
        school_id: plan.school_id ?? null,
        created_by: (plan as any).created_by ?? null,
        class_id: (plan as any).class_id ?? null,
        class_teacher_id: klass?.teacher_id ?? null,
      },
    )) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const { data, error } = await (supabase as any)
    .from('term_schedules')
    .upsert({
      lesson_plan_id: id,
      school_id: plan.school_id,
      is_active: true,
      current_week: 1,
      term_start,
      cadence_days: cadence_days ?? 7,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'lesson_plan_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
