import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET or POST /api/cron/term-scheduler
export async function GET(req: NextRequest) {
  return handleRequest(req);
}

export async function POST(req: NextRequest) {
  return handleRequest(req);
}

async function handleRequest(req: NextRequest) {
  if (!isValidCronSecret(extractCronSecret(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = adminClient();

  // Get all active schedules
  const { data: schedules } = await supabase
    .from('term_schedules')
    .select('*, lesson_plans!lesson_plan_id(id, plan_data, class_id, course_id)')
    .eq('is_active', true);

  let released = 0;
  let errors = 0;

  for (const schedule of schedules ?? []) {
    try {
      const planData = schedule.lesson_plans?.plan_data;
      if (!planData?.weeks) continue;

      const currentWeek = schedule.current_week;
      const weekData = planData.weeks[currentWeek - 1];
      if (!weekData) continue;

      // Release lessons for current week (teacher-approved = those with a title set)
      await supabase
        .from('lessons')
        .update({ status: 'published', published_at: new Date().toISOString() })
        .eq('lesson_plan_id', schedule.lesson_plan_id)
        .eq('week_number', currentWeek)
        .eq('status', 'draft');

      // Release assignments for current week — keyed via metadata.lesson_plan_id + metadata.week_number
      await supabase
        .from('assignments')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .filter('metadata->>lesson_plan_id', 'eq', schedule.lesson_plan_id)
        .filter('metadata->>week_number', 'eq', String(currentWeek))
        .or('is_active.is.null,is_active.eq.false');

      // Increment current_week
      await supabase
        .from('term_schedules')
        .update({ current_week: currentWeek + 1, updated_at: new Date().toISOString() })
        .eq('id', schedule.id);

      released++;
    } catch (e) {
      console.error(`Failed to release schedule ${schedule.id}:`, e);
      errors++;
    }
  }

  return NextResponse.json({ released, errors, total: (schedules ?? []).length });
}
