import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notificationsService } from '@/services/notifications.service';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * GET|POST /api/cron/at-risk-students
 *
 * Smart early-warning system. Over a rolling 14-day window it scores every active
 * student on three signals and flags those trending down, then sends each student's
 * class teacher one actionable digest (in-app + email) so problems are caught before
 * term-end. Signals:
 *   • Low graded average (< 50%)        → +2
 *   • No lesson activity in the window  → +2
 *   • Low attendance (< 60%)            → +1
 * level: score >= 4 → high, >= 2 → medium. Only medium+ are reported.
 *
 * Bulk queries keep it within the 60s cap. Idempotent per teacher per day via the
 * categorised-email guard. Schedule daily (e.g. 07:00) on cron-job.org.
 */
async function handleRequest(req: NextRequest) {
  if (!isValidCronSecret(extractCronSecret(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = adminClient();
  const today = new Date().toISOString().slice(0, 10);
  const windowIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const windowDate = windowIso.slice(0, 10);

  const { resolveAssignmentTermId, filterByAssignmentSession } = await import('@/lib/assignments/session');
  const liveTermId = await resolveAssignmentTermId(db as any, {});

  // 1. Active students (bounded for the serverless budget).
  const { data: students } = await db
    .from('portal_users')
    .select('id, full_name, class_id')
    .eq('role', 'student')
    .eq('is_active', true)
    .limit(500);

  const ids = (students ?? []).map((s) => s.id);
  if (ids.length === 0) return NextResponse.json({ flagged: 0, teachers_notified: 0 });

  // 2. Bulk-pull the three risk signals in parallel.
  const [gradesRes, activityRes, attendanceRes] = await Promise.all([
    db.from('assignment_submissions')
      .select('portal_user_id, grade, assignments(max_points, term_id)')
      .in('portal_user_id', ids)
      .not('grade', 'is', null)
      .gte('submitted_at', windowIso),
    db.from('lesson_progress')
      .select('portal_user_id')
      .in('portal_user_id', ids)
      .gte('last_accessed', windowIso),
    db.from('attendance')
      .select('student_id, status, term_id')
      .in('student_id', ids)
      .or(liveTermId ? `term_id.eq.${liveTermId},term_id.is.null` : 'term_id.is.null')
      .gte('date', windowDate),
  ]);

  // Aggregate graded average % per student (live session only within the window).
  const gradeAgg: Record<string, { sum: number; n: number }> = {};
  for (const r of filterByAssignmentSession((gradesRes.data ?? []) as any[], liveTermId)) {
    const max = Number(r.assignments?.max_points) || 100;
    const pct = (Number(r.grade) / max) * 100;
    if (!Number.isFinite(pct)) continue;
    (gradeAgg[r.portal_user_id] ??= { sum: 0, n: 0 });
    gradeAgg[r.portal_user_id].sum += pct;
    gradeAgg[r.portal_user_id].n += 1;
  }

  const activeIds = new Set((activityRes.data ?? []).map((r: any) => r.portal_user_id));

  const attAgg: Record<string, { present: number; total: number }> = {};
  for (const a of ((attendanceRes.data ?? []) as any[]).filter((row) =>
    !liveTermId || row.term_id === liveTermId || !row.term_id,
  )) {
    (attAgg[a.student_id] ??= { present: 0, total: 0 });
    attAgg[a.student_id].total += 1;
    if (a.status === 'present') attAgg[a.student_id].present += 1;
  }

  // 3. Score each student.
  type Flag = { id: string; name: string; classId: string | null; level: 'medium' | 'high'; reasons: string[] };
  const flags: Flag[] = [];
  for (const s of students ?? []) {
    const reasons: string[] = [];
    let score = 0;

    const g = gradeAgg[s.id];
    if (g && g.n > 0) {
      const avg = Math.round(g.sum / g.n);
      if (avg < 50) { score += 2; reasons.push(`Low graded average (${avg}%)`); }
    }
    if (!activeIds.has(s.id)) { score += 2; reasons.push('No lesson activity in 14 days'); }
    const att = attAgg[s.id];
    if (att && att.total > 0) {
      const rate = Math.round((att.present / att.total) * 100);
      if (rate < 60) { score += 1; reasons.push(`Low attendance (${rate}%)`); }
    }

    if (score >= 2) {
      flags.push({ id: s.id, name: s.full_name ?? 'Student', classId: s.class_id ?? null, level: score >= 4 ? 'high' : 'medium', reasons });
    }
  }

  if (flags.length === 0) return NextResponse.json({ flagged: 0, teachers_notified: 0 });

  // 4. Resolve each flagged student's class teacher.
  const classIds = Array.from(new Set(flags.map((f) => f.classId).filter(Boolean))) as string[];
  const classTeacher: Record<string, string> = {};
  if (classIds.length) {
    const { data: classes } = await db.from('classes').select('id, teacher_id').in('id', classIds);
    for (const c of (classes ?? []) as any[]) if (c.teacher_id) classTeacher[c.id] = c.teacher_id;
  }

  // Group flagged students by teacher.
  const byTeacher: Record<string, Flag[]> = {};
  let unassigned = 0;
  for (const f of flags) {
    const teacherId = f.classId ? classTeacher[f.classId] : undefined;
    if (!teacherId) { unassigned += 1; continue; }
    (byTeacher[teacherId] ??= []).push(f);
  }

  const teacherIds = Object.keys(byTeacher);
  const teacherInfo: Record<string, { email: string | null; name: string | null }> = {};
  if (teacherIds.length) {
    const { data: teachers } = await db.from('portal_users').select('id, email, full_name').in('id', teacherIds);
    for (const t of (teachers ?? []) as any[]) teacherInfo[t.id] = { email: t.email, name: t.full_name };
  }

  // 5. Notify each teacher — in-app always, email when address + preference allow.
  let teachersNotified = 0;
  for (const teacherId of teacherIds) {
    const list = byTeacher[teacherId].sort((a, b) => (a.level === b.level ? 0 : a.level === 'high' ? -1 : 1));
    const highCount = list.filter((f) => f.level === 'high').length;

    const rows = list.map((f) =>
      `<tr><td style="padding:6px 10px;border-bottom:1px solid #2a2d33;color:#fff;">${f.name}</td>` +
      `<td style="padding:6px 10px;border-bottom:1px solid #2a2d33;color:${f.level === 'high' ? '#f87171' : '#f59e0b'};font-weight:700;text-transform:uppercase;font-size:11px;">${f.level}</td>` +
      `<td style="padding:6px 10px;border-bottom:1px solid #2a2d33;color:#a1a1aa;font-size:12px;">${f.reasons.join('; ')}</td></tr>`,
    ).join('');

    const html = `<p style="font-size:15px;color:#fff;">${list.length} student${list.length > 1 ? 's' : ''} in your class need attention${highCount ? ` (<b style="color:#f87171;">${highCount} high-risk</b>)` : ''}.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#141618;border:1px solid #2a2d33;border-radius:8px;overflow:hidden;margin:12px 0;">
        <tr><th style="text-align:left;padding:8px 10px;background:#1c1e22;color:#71717a;font-size:11px;text-transform:uppercase;">Student</th><th style="text-align:left;padding:8px 10px;background:#1c1e22;color:#71717a;font-size:11px;text-transform:uppercase;">Risk</th><th style="text-align:left;padding:8px 10px;background:#1c1e22;color:#71717a;font-size:11px;text-transform:uppercase;">Why</th></tr>
        ${rows}
      </table>
      <p style="font-size:12px;color:#71717a;">Reach out, assign support work, or review their progress in the dashboard.</p>`;

    // Per-teacher work is guarded so one teacher's failure never aborts the rest of the digest run.
    try {
      // In-app alert (always)
      await notificationsService.logNotification(
        teacherId,
        `${list.length} student${list.length > 1 ? 's' : ''} need attention`,
        `${highCount ? `${highCount} high-risk. ` : ''}Tap to review at-risk students in your class.`,
        'warning',
      );

      // Email digest (idempotent per teacher per day; respects attendance_alerts pref)
      const info = teacherInfo[teacherId];
      if (info?.email) {
        await notificationsService.sendCategorisedEmail({
          userId: teacherId,
          to: info.email,
          subject: `${list.length} student${list.length > 1 ? 's' : ''} need attention — Rillcod`,
          html,
          category: 'attendance_alerts',
          eventType: 'at_risk_digest',
          referenceId: `${teacherId}:${today}`,
        });
      }
      teachersNotified += 1;
    } catch (err) {
      console.error('[cron/at-risk-students] notify failed for teacher', teacherId, err);
    }
  }

  return NextResponse.json({
    flagged: flags.length,
    teachers_notified: teachersNotified,
    unassigned_no_teacher: unassigned,
  });
}

export async function GET(req: NextRequest) { return handleRequest(req); }
export async function POST(req: NextRequest) { return handleRequest(req); }
