import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccessProgressReport } from '@/lib/reports/access';
import { buildEmailTrackingPixelUrl } from '@/lib/email/email-tracking-token';
import { buildReportEmail, isInAppEmail } from '@/lib/email/rillcod-transactional-email';
import { notificationsService } from '@/services/notifications.service';
import { SMTP_FROM_EMAIL } from '@/config/brand';
import { logAudit } from '@/lib/audit/log';
import { rateLimitproxy } from '@/proxies/rateLimit.proxy';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
const MAX_PDF_BASE64_SIZE = 13_500_000;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await rateLimitproxy(request, user.id);
  if (limited) return limited;

  const { id } = await context.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });

  const admin: any = createAdminClient();
  const [{ data: caller, error: callerError }, { data: report, error: reportError }] = await Promise.all([
    admin.from('portal_users').select('id,role,school_id,full_name').eq('id', user.id).maybeSingle(),
    admin.from('student_progress_reports').select('id,student_id,student_name,teacher_id,school_id,class_id,school_name,report_term,report_period,overall_grade,is_published,verification_code,updated_at').eq('id', id).maybeSingle(),
  ]);
  if (callerError || !caller || !['admin', 'teacher', 'school'].includes(caller.role)) {
    return NextResponse.json({ error: 'Only authorised staff can share reports.' }, { status: 403 });
  }
  if (reportError) return NextResponse.json({ error: 'The report could not be verified before sharing. Please try again.' }, { status: 503 });
  if (!report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });

  if (caller.role === 'school') {
    if (!caller.school_id || caller.school_id !== report.school_id) {
      return NextResponse.json({ error: 'This report is outside your school.' }, { status: 403 });
    }
  } else if (caller.role === 'teacher') {
    const access = await canAccessProgressReport(admin, caller, report);
    if (!access.ok) return NextResponse.json({ error: 'This report is outside your assigned class or school.' }, { status: 403 });
  }
  if (!report.is_published) {
    return NextResponse.json({ error: 'Publish this report before sharing it with a family.', code: 'REPORT_NOT_PUBLISHED' }, { status: 409 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'The share request is invalid.' }, { status: 400 });
  }
  const to = String(body.to || '').trim().toLowerCase();
  const expectedUpdatedAt = typeof body.expected_updated_at === 'string' && body.expected_updated_at.trim()
    ? body.expected_updated_at.trim()
    : null;
  if (!Object.prototype.hasOwnProperty.call(body, 'expected_updated_at')) {
    return NextResponse.json({ error: 'Reload this report before sharing so the exact published version is used.', code: 'REPORT_VERSION_REQUIRED' }, { status: 428 });
  }
  if ((expectedUpdatedAt ?? null) !== (report.updated_at ?? null)) {
    return NextResponse.json({ error: 'This report changed after you opened it. Reload the latest published version before sharing.', code: 'STALE_REPORT_DRAFT' }, { status: 409 });
  }
  if (!EMAIL_RE.test(to)) return NextResponse.json({ error: 'Enter a valid recipient email address.' }, { status: 400 });

  const attachment = body.attachment && typeof body.attachment === 'object'
    ? body.attachment as { filename?: unknown; content?: unknown }
    : null;
  const content = typeof attachment?.content === 'string' ? attachment.content : '';
  const safeFilename = typeof attachment?.filename === 'string'
    ? attachment.filename.split(/[\/\\]/).pop()!.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180)
    : '';
  if (!isInAppEmail(to)) {
    if (!safeFilename || !safeFilename.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'The report PDF needs a valid filename.' }, { status: 400 });
    }
    if (!content || content.length > MAX_PDF_BASE64_SIZE || !BASE64_RE.test(content) || !content.startsWith('JVBER')) {
      return NextResponse.json({ error: 'The report PDF is missing or invalid. Generate it again and retry.' }, { status: 400 });
    }
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com').replace(/\/$/, '');
  const reportUrl = report.verification_code
    ? `${appUrl}/result-check/${encodeURIComponent(report.verification_code)}`
    : `${appUrl}/dashboard/parent-results`;
  const studentName = report.student_name || 'Student';
  const term = report.report_term || 'Current Term';
  const subject = `Progress Report — ${studentName} (${term})`;
  const now = new Date().toISOString();
  let channel: 'in_app' | 'smtp' = 'smtp';

  try {
    if (isInAppEmail(to)) {
      channel = 'in_app';
      const { data: recipient, error: recipientError } = await admin
        .from('portal_users')
        .select('id')
        .ilike('email', to)
        .maybeSingle();
      if (recipientError) throw recipientError;
      if (!recipient?.id) {
        return NextResponse.json({ error: 'No portal user was found for this Rillcod address.' }, { status: 400 });
      }
      const { error: notificationError } = await admin.from('notifications').insert({
        user_id: recipient.id,
        title: subject,
        message: `${caller.full_name || 'Rillcod staff'} shared ${studentName}'s ${term} report. Open the verified report in Rillcod.`,
        type: 'info',
        is_read: false,
        action_url: reportUrl.replace(appUrl, ''),
        created_at: now,
        updated_at: now,
      });
      if (notificationError) throw notificationError;
    } else {
      const html = buildReportEmail({
        recipientName: to.split('@')[0] || 'Parent or guardian',
        studentName,
        term,
        academicYear: report.report_period || undefined,
        schoolName: report.school_name || undefined,
        overallGrade: report.overall_grade || undefined,
        portalUrl: reportUrl,
        appUrl,
        trackingPixelUrl: buildEmailTrackingPixelUrl({ appUrl, reportId: report.id, email: to }),
      });
      await notificationsService.sendExternalEmail({
        to,
        subject,
        html,
        fromName: `${caller.full_name || 'Rillcod staff'} via Rillcod Technologies`,
        fromEmail: SMTP_FROM_EMAIL,
        attachments: [{ filename: safeFilename, content }],
        automated: false,
        eventType: 'progress_report_shared',
        referenceId: `${report.id}:${to}:${now}`,
      });
    }
  } catch (error) {
    console.error('[progress-report/email] delivery failed:', error);
    return NextResponse.json({ error: 'The report could not be delivered. Nothing was marked as sent; please try again.' }, { status: 502 });
  }

  let auditWarning: string | null = null;
  try {
    const { error: eventError } = await admin.from('email_events').insert({
      report_id: report.id,
      event: 'sent',
      email: to,
      occurred_at: now,
    });
    if (eventError) throw eventError;
    await logAudit(admin, {
      action: 'share_progress_report',
      actorId: caller.id,
      resourceType: 'progress_report',
      resourceId: report.id,
      tableName: 'student_progress_reports',
      newValue: `${studentName}'s ${term} report was shared`,
      newValues: { recipient: to, channel, report_updated_at: report.updated_at },
    });
  } catch (error) {
    auditWarning = 'The report was delivered, but its activity record needs administrator review.';
    console.error('[progress-report/email] delivery audit failed:', error);
  }

  return NextResponse.json({
    data: {
      success: true,
      channel,
      to,
      ...(auditWarning ? { warning: auditWarning } : {}),
    },
  });
}
