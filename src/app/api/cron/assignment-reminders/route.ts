import { NextRequest, NextResponse } from 'next/server';
import { notificationsService } from '@/services/notifications.service';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { runMonitoredCron } from '@/lib/operations/cron-monitor';
import { cronInterval } from '@/lib/operations/cron-registry';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET|POST /api/cron/assignment-reminders
 *
 * Sends "assignment due tomorrow" reminders to every enrolled student. The
 * logic already lived in notificationsService.checkUpcomingAssignments() but was
 * never wired to a trigger — this endpoint exposes it to the external scheduler.
 * Idempotency is handled downstream by the categorised-email guard. Schedule
 * once per day (e.g. 18:00) on cron-job.org with the x-cron-secret header.
 */
async function handleRequest(req: NextRequest) {
  if (!isValidCronSecret(extractCronSecret(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await notificationsService.checkUpcomingAssignments();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[cron/assignment-reminders] error:', err);
    return NextResponse.json({ error: err?.message || 'failed' }, { status: 500 });
  }
}

// Monitored: reached only through onboarding-sweep's daily fan-out, so without its own health
// row a broken fan-out would look identical to a quiet day.
export async function GET(req: NextRequest) { return runMonitoredCron('assignment-reminders', cronInterval('assignment-reminders'), () => handleRequest(req)); }
export async function POST(req: NextRequest) { return runMonitoredCron('assignment-reminders', cronInterval('assignment-reminders'), () => handleRequest(req)); }
