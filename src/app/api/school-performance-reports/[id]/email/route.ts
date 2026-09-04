import { NextRequest, NextResponse } from 'next/server';
import { canManageSchoolReport, getSchoolReportActor } from '@/lib/school-reports/access';
import {
  buildSchoolReportPdfBuffer,
  loadSchoolReportEmailSuggestions,
} from '@/lib/school-reports/pdf-delivery';
import { recordSchoolReportEvent } from '@/lib/school-reports/revisions';
import { buildSchoolPerformanceReportEmail, isInAppEmail } from '@/lib/email/rillcod-transactional-email';
import { SMTP_FROM_EMAIL } from '@/config/brand';
import { notificationsService } from '@/services/notifications.service';
import { logAuditEvent } from '@/lib/observability/audit-events';
import type { SchoolPerformanceReportRow } from '@/lib/school-reports/types';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REPORT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await getSchoolReportActor();
  if (!actor || !['admin', 'teacher'].includes(actor.profile.role)) {
    return NextResponse.json({ error: 'Only authorised staff can email school reports.' }, { status: 403 });
  }

  const { id } = await context.params;
  if (!REPORT_ID.test(id)) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  const { data: report, error } = await actor.admin
    .from('school_performance_reports')
    .select('id,school_id')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  if (!canManageSchoolReport(actor, report.school_id)) {
    return NextResponse.json({ error: 'You cannot email this report.' }, { status: 403 });
  }

  const suggestions = await loadSchoolReportEmailSuggestions(actor.admin, report.school_id);
  return NextResponse.json({ data: { suggestions } });
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await getSchoolReportActor();
  if (!actor || !['admin', 'teacher'].includes(actor.profile.role)) {
    return NextResponse.json({ error: 'Only authorised staff can email school reports.' }, { status: 403 });
  }

  const { id } = await context.params;
  if (!REPORT_ID.test(id)) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  const { data: report, error } = await actor.admin
    .from('school_performance_reports')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  if (!canManageSchoolReport(actor, report.school_id)) {
    return NextResponse.json({ error: 'You cannot email this report.' }, { status: 403 });
  }

  let to = '';
  let toName = '';
  let message = '';
  let revision: string | null = null;
  try {
    const body = await req.json();
    to = String(body.to || '').trim().toLowerCase();
    toName = String(body.toName || body.to_name || '').trim().slice(0, 160);
    message = String(body.message || '').trim().slice(0, 4_000);
    revision = body.revision != null && body.revision !== '' ? String(body.revision) : null;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!to || !EMAIL_RE.test(to)) {
    return NextResponse.json({ error: 'Enter a valid recipient email address.' }, { status: 400 });
  }

  const row = report as SchoolPerformanceReportRow;
  const schoolName = row.snapshot?.school?.name || row.title || 'School';
  const termLabel = row.term_label || row.snapshot?.period?.termLabel || 'Term';
  const academicYear = row.academic_year || row.snapshot?.period?.academicYear || '';
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com').replace(/\/$/, '');
  const recipientName = toName || to.split('@')[0] || 'Recipient';
  const senderName = actor.profile.full_name || 'Rillcod staff';
  const subject = `School performance report — ${schoolName} (${termLabel}${academicYear ? ` · ${academicYear}` : ''})`;

  try {
    const { buffer, filename, pdfHash, contentHash, revisionNumber } = await buildSchoolReportPdfBuffer(
      actor.admin,
      row,
      // An attachment leaves the staff workspace, so it must always use the
      // school-safe audience even when an admin or teacher initiates delivery.
      'school',
      revision,
    );
    const portalPath = `/dashboard/school-reports/${id}${revisionNumber ? `?revision=${revisionNumber}` : ''}`;
    const portalUrl = `${appUrl}${portalPath}`;
    const html = buildSchoolPerformanceReportEmail({
      recipientName,
      schoolName,
      reportTitle: row.title,
      termLabel,
      academicYear,
      senderName,
      message: message || undefined,
      portalUrl,
      appUrl,
    });

    if (isInAppEmail(to)) {
      const { data: recipient, error: recipientError } = await actor.admin
        .from('portal_users')
        .select('id')
        .ilike('email', to)
        .maybeSingle();
      if (recipientError) throw new Error(recipientError.message);

      if (recipient?.id) {
        const { error: notificationError } = await actor.admin.from('notifications').insert({
          user_id: recipient.id,
          title: subject,
          message: `${senderName} shared the ${termLabel} performance report for ${schoolName}. Open the report in your dashboard to view or download the PDF.`,
          type: 'info',
          is_read: false,
          action_url: portalPath,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        if (notificationError) throw new Error(`In-app notification could not be saved: ${notificationError.message}`);
      } else {
        return NextResponse.json(
          { error: 'No portal user found for this in-app address. Use an external email to attach the PDF.' },
          { status: 400 },
        );
      }
    } else {
      await notificationsService.sendExternalEmail({
        to,
        subject,
        html,
        fromName: `${senderName} via Rillcod Technologies`,
        fromEmail: SMTP_FROM_EMAIL,
        attachments: [{ filename, content: buffer.toString('base64') }],
        automated: false,
        eventType: 'school_report_email',
        referenceId: `${id}:${to}:${new Date().toISOString().slice(0, 10)}`,
      });
    }

    let auditWarning: string | null = null;
    try {
      await recordSchoolReportEvent(actor.admin, {
        reportId: id,
        eventType: 'emailed',
        actorId: actor.profile.id,
        payload: {
          to,
          toName: toName || null,
          filename,
          revision: revisionNumber,
          pdfHash,
          contentHash,
          channel: isInAppEmail(to) ? 'in_app' : 'smtp',
        },
      });
      logAuditEvent('report.email', {
        reportId: id,
        schoolId: row.school_id,
        to,
        actorId: actor.profile.id,
      });
    } catch (error) {
      auditWarning = error instanceof Error ? error.message : 'Delivery was completed but its report event could not be recorded.';
      console.error('[school-report/email] delivery audit failed:', auditWarning);
    }

    return NextResponse.json({
      data: {
        success: true,
        to,
        subject,
        filename,
        revision: revisionNumber,
        pdfHash,
        contentHash,
        ...(auditWarning ? { auditWarning } : {}),
      },
    });
  } catch (sendError) {
    console.error('[school-report/email]', sendError);
    return NextResponse.json(
      { error: sendError instanceof Error ? sendError.message : 'Unable to email the report.' },
      { status: 500 },
    );
  }
}
