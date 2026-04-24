import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// POST /api/lesson-plans/[id]/release-week — manually release a specific week's content
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { week_number } = await req.json();
  if (!week_number) return NextResponse.json({ error: 'week_number is required', field: 'week_number' }, { status: 400 });

  // Release lessons
  const { count: lessonsReleased } = await (supabase as any)
    .from('lessons')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('lesson_plan_id', id)
    .eq('week_number', week_number)
    .eq('status', 'draft');

  // Release assignments
  const { count: assignmentsReleased } = await (supabase as any)
    .from('assignments')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .contains('metadata', { lesson_plan_id: id, week_number });

  return NextResponse.json({
    success: true,
    lessonsReleased: lessonsReleased ?? 0,
    assignmentsReleased: assignmentsReleased ?? 0,
    week_number,
  });
}
