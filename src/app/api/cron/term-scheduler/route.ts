import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { runMonitoredCron } from '@/lib/operations/cron-monitor';
import { cronInterval } from '@/lib/operations/cron-registry';
import { releasePreparedWeek } from '@/lib/academic/release-week-content';
import { parseAutoGenerateSettings } from '@/lib/academic/auto-generate-settings';
import { scheduledWeekForDate } from './schedule';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Cadence clock for plans that opted into a term schedule.
 *
 * Release policy comes from the plan's auto_generate_settings — the same
 * setting the nightly prep sweep and the plan page edit. When auto_publish is
 * false (the default), this job advances the week marker but does NOT publish;
 * content stays on the approvals queue. Only an explicit auto_publish: true
 * releases through releasePreparedWeek.
 *
 * Works for both Regular School and Special/Online pathways: schedules are
 * keyed on lesson_plan_id, and each plan already resolved its own official
 * edition when it was created.
 */
export async function GET(req: NextRequest) {
  return runMonitoredCron('term-scheduler', cronInterval('term-scheduler'), () => handleRequest(req));
}

export async function POST(req: NextRequest) {
  return runMonitoredCron('term-scheduler', cronInterval('term-scheduler'), () => handleRequest(req));
}

async function handleRequest(req: NextRequest) {
  if (!isValidCronSecret(extractCronSecret(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = adminClient();

  const { data: schedules } = await supabase
    .from('term_schedules')
    .select('*, lesson_plans!lesson_plan_id(id, plan_data, class_id, course_id, metadata)')
    .eq('is_active', true);

  let released = 0;
  let held = 0;
  let waiting = 0;
  let finished = 0;
  let errors = 0;

  for (const schedule of schedules ?? []) {
    try {
      const plan = schedule.lesson_plans;
      const planData = plan?.plan_data;
      if (!planData?.weeks) continue;

      const currentWeek = schedule.current_week;
      const weeks = Array.isArray(planData.weeks) ? planData.weeks : [];
      if (currentWeek > weeks.length) {
        const { error: finishError } = await supabase
          .from('term_schedules')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', schedule.id);
        if (finishError) throw finishError;
        finished += 1;
        continue;
      }
      const dueWeek = scheduledWeekForDate(schedule.term_start, schedule.cadence_days);
      if (dueWeek < currentWeek) {
        waiting += 1;
        continue;
      }
      const weekData = planData.weeks[currentWeek - 1];
      if (!weekData) continue;

      const settings = parseAutoGenerateSettings(
        (plan?.metadata as Record<string, unknown> | null)?.auto_generate_settings
      );

      // Same publish rule as auto-generate-content / generatePlanWeek.
      if (settings.auto_publish) {
        const release = await releasePreparedWeek({
          planId: schedule.lesson_plan_id,
          week: currentWeek,
        });
        if (release.error) throw new Error(release.error);
        released++;
      } else {
        // Prepared content stays held for the teacher approvals queue.
        held++;
      }

      const { error: advanceError } = await supabase
        .from('term_schedules')
        .update({ current_week: currentWeek + 1, updated_at: new Date().toISOString() })
        .eq('id', schedule.id);
      if (advanceError) throw advanceError;
    } catch (e) {
      console.error(`Failed to release schedule ${schedule.id}:`, e);
      errors++;
    }
  }

  return NextResponse.json({
    released,
    held,
    waiting,
    finished,
    errors,
    total: (schedules ?? []).length,
  });
}
