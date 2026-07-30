import { NextRequest, NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runAcademicReadinessAutomation } from '@/lib/academic/readiness-automation';
import { runMonitoredCron } from '@/lib/operations/cron-monitor';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { fanoutCrons, fanoutFailures } from '@/lib/server/cron-fanout';
import { recordFanoutResult } from '@/lib/server/cron-daily-guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function handle(req: NextRequest) {
  if (!isValidCronSecret(extractCronSecret(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const report = await runAcademicReadinessAutomation(createAdminClient() as any);
  const success = report.issues.every((item) => !['automation_failed', 'notification_failed'].includes(item.code));

  // Chain content generation after plans are prepared (sequential, not parallel fanout).
  if (success) {
    after(async () => {
      const fan = await fanoutCrons(req.url, ['auto-generate-content']);
      await recordFanoutResult(createAdminClient() as any, 'cron_academic_readiness_last_fanout', 'academic-readiness', fan);
      const failed = fanoutFailures(fan);
      if (failed.length) {
        console.error('[academic-readiness] auto-generate fan-out failed:', failed);
      }
    });
  }

  return NextResponse.json({
    success,
    ...report,
    effects: [
      'invalid_or_missing_teacher_reassigned_by_workload',
      'single_course_programmes_inferred',
      'official_teaching_plans_prepared',
      'teachers_notified',
      'ambiguous_or_unconfigured_classes_left_for_human_decision',
    ],
  });
}

export async function GET(req: NextRequest) {
  return runMonitoredCron('academic-readiness', 360, () => handle(req));
}

export async function POST(req: NextRequest) {
  return runMonitoredCron('academic-readiness', 360, () => handle(req));
}
