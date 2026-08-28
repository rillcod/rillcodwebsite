import { NextRequest, NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runAcademicReadinessAutomation } from '@/lib/academic/readiness-automation';
import { materialiseTimetableSessions } from '@/lib/timetable/materialise-sessions';
import { runMonitoredCron } from '@/lib/operations/cron-monitor';
import { cronInterval } from '@/lib/operations/cron-registry';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { fanoutCrons, fanoutFailures } from '@/lib/server/cron-fanout';
import { alertFanoutFailures } from '@/lib/server/cron-fanout-alerts';
import { recordFanoutResult } from '@/lib/server/cron-daily-guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function handle(req: NextRequest) {
  if (!isValidCronSecret(extractCronSecret(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = createAdminClient() as any;
  const report = await runAcademicReadinessAutomation(admin);
  const success = report.issues.every((item) => !['automation_failed', 'notification_failed'].includes(item.code));

  // Fill the register from the timetable.
  //
  // The school already said when every lesson is; class_sessions is what a
  // teacher marks attendance against; and nothing joined the two, so 115
  // sessions were typed by hand against 11 slots that could have produced them.
  //
  // Runs here rather than on a scheduler of its own: it needs the classes and
  // terms this sweep has just settled, and a second cron would only be a second
  // thing to keep alive. Only slots naming a class take part — the rest are
  // reported, because a register in front of the wrong children is worse than
  // no register.
  const timetable = await materialiseTimetableSessions(admin).catch((error) => ({
    slotsConsidered: 0,
    sessionsCreated: 0,
    skipped: [],
    errors: [error instanceof Error ? error.message : String(error)],
  }));

  // Chain content generation after plans are prepared (sequential, not parallel fanout).
  if (success) {
    after(async () => {
      const fan = await fanoutCrons(req.url, ['auto-generate-content']);
      await recordFanoutResult(admin, 'cron_academic_readiness_last_fanout', 'academic-readiness', fan);
      const failed = fanoutFailures(fan);
      if (failed.length) {
        console.error('[academic-readiness] auto-generate fan-out failed:', failed);
        await alertFanoutFailures(admin, 'academic-readiness', fan);
      }
    });
  }

  return NextResponse.json({
    success,
    ...report,
    timetable,
    effects: [
      'invalid_or_missing_teacher_reassigned_by_workload',
      'single_course_programmes_inferred',
      'official_teaching_plans_prepared',
      'teachers_notified',
      'timetable_slots_materialised_into_class_sessions',
      'ambiguous_or_unconfigured_classes_left_for_human_decision',
    ],
  });
}

// Driven by onboarding-sweep's existing daily-guarded fan-out rather than its own scheduler
// entry, so the health interval is daily (verified against cron_run_history).
export async function GET(req: NextRequest) {
  return runMonitoredCron('academic-readiness', cronInterval('academic-readiness'), () => handle(req));
}

export async function POST(req: NextRequest) {
  return runMonitoredCron('academic-readiness', cronInterval('academic-readiness'), () => handle(req));
}
