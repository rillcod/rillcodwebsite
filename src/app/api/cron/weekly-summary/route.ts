import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notificationsService } from '@/services/notifications.service';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// GET or POST /api/cron/weekly-summary
export async function GET(req: NextRequest) {
  return handleRequest(req);
}

export async function POST(req: NextRequest) {
  return handleRequest(req);
}

async function handleRequest(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = adminClient();
  const now = new Date();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const weekStartDate = weekStart.slice(0, 10);

  // Get parents with weekly_summary enabled
  const { data: parents } = await supabase
    .from('notification_preferences')
    .select('portal_user_id, portal_users!portal_user_id(email, full_name)')
    .eq('weekly_summary', true);

  let sent = 0;

  for (const parent of parents ?? []) {
    const portalUser = parent.portal_users as any;
    const parentEmail = portalUser?.email;
    if (!parentEmail) continue;

    // Idempotency check via Redis would go here in full impl
    // For now just send

    // Get linked students
    const { data: links } = await supabase
      .from('parent_student_links')
      .select('student_id, portal_users!student_id(full_name)')
      .eq('parent_id', parent.portal_user_id);

    if (!links?.length) continue;

    const studentSummaries = [];
    for (const link of links) {
      const sid = link.student_id;
      const sName = (link.portal_users as any)?.full_name ?? 'Student';

      const [lessons, assignments, attendance, points] = await Promise.all([
        supabase.from('lesson_progress').select('id', { count: 'exact', head: true }).eq('portal_user_id', sid).gte('last_accessed', weekStart),
        supabase.from('assignment_submissions').select('id', { count: 'exact', head: true }).eq('portal_user_id', sid).gte('submitted_at', weekStart),
        supabase.from('attendance').select('status').eq('student_id', sid).gte('date', weekStartDate),
        supabase.from('point_transactions').select('points').eq('portal_user_id', sid).gte('created_at', weekStart),
      ]);

      const attendanceRate = attendance.data?.length
        ? Math.round((attendance.data.filter((a: any) => a.status === 'present').length / attendance.data.length) * 100)
        : null;

      const xp = (points.data ?? []).reduce((s: number, p: any) => s + (Number(p.points) || 0), 0);

      studentSummaries.push({
        name: sName,
        lessonsCompleted: lessons.count ?? 0,
        assignmentsSubmitted: assignments.count ?? 0,
        attendanceRate,
        xp,
      });
    }

    const hasActivity = studentSummaries.some(s => s.lessonsCompleted > 0 || s.assignmentsSubmitted > 0 || (s.xp ?? 0) > 0);

    const summaryText = studentSummaries.map(s => `
      <b>${s.name}</b><br>
      Lessons completed: ${s.lessonsCompleted}<br>
      Assignments submitted: ${s.assignmentsSubmitted}<br>
      Attendance rate: ${s.attendanceRate != null ? s.attendanceRate + '%' : 'N/A'}<br>
      XP earned this week: ${s.xp}
    `).join('<hr>');

    const htmlBody = hasActivity
      ? `<p>Here's your weekly summary:</p>${summaryText}<p><a href="https://rillcod.com/dashboard">View Dashboard</a></p>`
      : `<p>No activity was recorded for your child(ren) this week. Log in to stay informed: <a href="https://rillcod.com/dashboard">Dashboard</a></p>`;

    await notificationsService.sendCategorisedEmail({
      userId: parent.portal_user_id,
      to: parentEmail,
      subject: `Rillcod Weekly Summary — Week of ${weekStartDate}`,
      html: htmlBody,
      category: 'weekly_summary',
      eventType: 'weekly_summary',
      referenceId: `${parentEmail}:${weekStartDate}`,
    });
    sent++;
  }

  return NextResponse.json({ sent });
}
