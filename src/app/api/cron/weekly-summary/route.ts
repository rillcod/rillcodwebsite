import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notificationsService } from '@/services/notifications.service';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { runMonitoredCron } from '@/lib/operations/cron-monitor';
import { buildMonthlyParentUpdateEmail } from '@/lib/communication/monthly-parent-email';
import { monthlyPeriodKey, markSentThisMonth, wasSentThisMonth } from '@/lib/communication/monthly-send-guard';

export const dynamic = 'force-dynamic';

const MONTHLY_MINUTES = 30 * 24 * 60; // cron monitor expects ~monthly cadence

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** Parent monthly update (uses existing weekly-summary cron + weekly_summary pref). */
export async function GET(req: NextRequest) {
  return runMonitoredCron('weekly-summary', MONTHLY_MINUTES, () => handleRequest(req));
}

export async function POST(req: NextRequest) {
  return runMonitoredCron('weekly-summary', MONTHLY_MINUTES, () => handleRequest(req));
}

async function handleRequest(req: NextRequest) {
  if (!isValidCronSecret(extractCronSecret(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = adminClient();
  const now = new Date();
  const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const monthLabel = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const periodKey = monthlyPeriodKey(now);

  const { data: parents } = await supabase
    .from('notification_preferences')
    .select('portal_user_id, portal_users!portal_user_id(email, full_name)')
    .eq('weekly_summary', true);

  let sent = 0;
  let skippedAlreadySent = 0;
  const DEADLINE = Date.now() + 50_000;

  for (const parent of parents ?? []) {
    if (Date.now() > DEADLINE) break;
    const portalUser = parent.portal_users as { email?: string; full_name?: string } | null;
    const parentEmail = portalUser?.email;
    if (!parentEmail) continue;

    if (await wasSentThisMonth('monthly_summary', parentEmail, periodKey)) {
      skippedAlreadySent++;
      continue;
    }

    const { data: linksRows } = await supabase
      .from('parent_student_links')
      .select('student_id, portal_users!student_id(full_name)')
      .eq('parent_id', parent.portal_user_id);

    if (!linksRows?.length) continue;

    const studentSummaries: Array<{ name: string; lessons: number; assignments: number; attendanceRate: number | null; xp: number }> = [];
    for (const link of linksRows) {
      const sid = link.student_id;
      const sName = (link.portal_users as { full_name?: string } | null)?.full_name ?? 'Your child';

      const [lessons, assignments, attendance, points] = await Promise.all([
        supabase.from('lesson_progress').select('id', { count: 'exact', head: true }).eq('portal_user_id', sid).gte('last_accessed', monthStart),
        supabase.from('assignment_submissions').select('id', { count: 'exact', head: true }).eq('portal_user_id', sid).gte('submitted_at', monthStart),
        supabase.from('attendance').select('status').eq('student_id', sid).gte('date', monthStart.slice(0, 10)),
        supabase.from('point_transactions').select('points').eq('portal_user_id', sid).gte('created_at', monthStart),
      ]);

      const attendanceRate = attendance.data?.length
        ? Math.round((attendance.data.filter((a: { status: string }) => a.status === 'present').length / attendance.data.length) * 100)
        : null;
      const xp = (points.data ?? []).reduce((s: number, p: { points?: number }) => s + (Number(p.points) || 0), 0);

      studentSummaries.push({
        name: sName,
        lessons: lessons.count ?? 0,
        assignments: assignments.count ?? 0,
        attendanceRate,
        xp,
      });
    }

    const firstName = (portalUser?.full_name || 'there').split(' ')[0];
    const { subject, html } = buildMonthlyParentUpdateEmail({
      parentFirstName: firstName,
      monthLabel,
      students: studentSummaries,
    });

    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const delivered = await notificationsService.sendCategorisedEmail({
      userId: parent.portal_user_id,
      to: parentEmail,
      subject,
      html,
      category: 'weekly_summary',
      eventType: 'monthly_summary',
      referenceId: `${parentEmail}:${monthKey}`,
    });

    if (delivered) {
      await markSentThisMonth('monthly_summary', parentEmail, periodKey);
      sent++;
    }
  }

  return NextResponse.json({ sent, skippedAlreadySent, cadence: 'monthly', periodKey });
}
