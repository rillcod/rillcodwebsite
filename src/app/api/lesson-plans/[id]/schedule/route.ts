import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

  const { data, error } = await (supabase as any)
    .from('term_schedules')
    .upsert({
      lesson_plan_id: id,
      school_id: profile.school_id,
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
