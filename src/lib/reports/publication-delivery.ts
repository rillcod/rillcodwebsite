import { SMTP_FROM_EMAIL } from '@/config/brand';
import { buildEmailTrackingPixelUrl } from '@/lib/email/email-tracking-token';
import { buildReportEmail, isInAppEmail } from '@/lib/email/rillcod-transactional-email';
import { recordDeadLetter } from '@/lib/operations/dead-letter';
import { getParentsForStudentPortalId } from '@/lib/parents/links';
import { enqueueWhatsApp } from '@/lib/whatsapp/send';
import { queueService } from '@/services/queue.service';
import { deliverNotificationsOnce } from '@/lib/notifications/deliver-once';

type PublishedProgressReport = {
  id: string;
  student_id: string;
  verification_code?: string | null;
  overall_grade?: string | null;
  overall_score?: number | null;
  course_name?: string | null;
  report_term?: string | null;
  report_period?: string | null;
  school_id?: string | null;
};

type Contact = { name: string; userId: string | null };

export type ProgressReportDeliveryResult = {
  status: 'queued' | 'partial' | 'no_contacts' | 'recovery_required' | 'delivery_failed';
  emailQueued: number;
  whatsappQueued: number;
  inAppCreated: number;
  failures: string[];
};

function reportLabel(report: PublishedProgressReport) {
  return report.report_term && report.report_period
    ? `${report.report_term} (${report.report_period})`
    : report.report_term || report.course_name || 'current term';
}

function messageForParent(parentName: string, studentName: string, term: string, grade: string | undefined, verifyUrl: string) {
  return `Hello ${parentName}, ${studentName}'s ${term} progress report has been published` +
    `${grade ? ` (Overall: ${grade})` : ''}.\n\n` +
    `View and verify it here: ${verifyUrl}\n\n— Rillcod Technologies`;
}

/**
 * Canonical publication delivery path used by single and bulk publishing.
 * Every outbound message is persisted to a retryable queue before the request
 * reports completion; the function is called only for a new publish transition.
 */
export async function queueProgressReportPublicationDelivery(
  admin: any,
  report: PublishedProgressReport,
  actorId: string | null,
): Promise<ProgressReportDeliveryResult> {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com';
    const studentPortalUrl = `${appUrl}/dashboard/results?student=${report.student_id}`;
    const parentPortalUrl = `${appUrl}/dashboard/parent-results`;
    const verifyUrl = report.verification_code
      ? `${appUrl}/result-check/${report.verification_code}`
      : parentPortalUrl;
    const subject = 'Progress Report Published — Rillcod Technologies';
    const grade = report.overall_grade ?? (report.overall_score != null ? `${report.overall_score}%` : undefined);
    const term = reportLabel(report);

    const [studentResult, studentRowResult, portalParents] = await Promise.all([
      admin.from('portal_users')
        .select('id, email, full_name, school_id')
        .eq('id', report.student_id)
        .maybeSingle(),
      admin.from('students')
        .select('parent_email, parent_name, parent_phone')
        .eq('user_id', report.student_id)
        .maybeSingle(),
      getParentsForStudentPortalId(admin, report.student_id),
    ]);
    if (studentResult.error) throw studentResult.error;
    if (studentRowResult.error) throw studentRowResult.error;

    const student = studentResult.data;
    const studentRow = studentRowResult.data;
    const studentName = student?.full_name || 'Student';
    const emailContacts = new Map<string, Contact>();
    const phoneContacts = new Map<string, Contact>();

    if (studentRow?.parent_email) {
      emailContacts.set(String(studentRow.parent_email).trim().toLowerCase(), {
        name: studentRow.parent_name || 'Parent/Guardian',
        userId: null,
      });
    }
    if (studentRow?.parent_phone) {
      phoneContacts.set(String(studentRow.parent_phone), {
        name: studentRow.parent_name || 'Parent/Guardian',
        userId: null,
      });
    }
    for (const parent of portalParents) {
      if (parent.email) emailContacts.set(parent.email.trim().toLowerCase(), { name: parent.full_name || 'Parent/Guardian', userId: parent.id });
      if (parent.phone) phoneContacts.set(parent.phone, { name: parent.full_name || 'Parent/Guardian', userId: parent.id });
    }

    let emailQueued = 0;
    let whatsappQueued = 0;
    let inAppCreated = 0;
    const failures: string[] = [];
    let recoveryUntracked = false;
    const preserveFailure = async (
      channel: string,
      recipient: string | null,
      recoveryUserId: string | null,
      retry: Record<string, unknown>,
      error: unknown,
    ) => {
      const recoveryId = await recordDeadLetter({
        source: `progress_report_delivery_${channel}`,
        jobType: channel,
        originalJobId: `progress-report:${report.id}:${channel}:${recipient || report.student_id}`,
        userId: recoveryUserId,
        payload: { reportId: report.id, recipient, retry },
        error: error instanceof Error ? error.message : String(error),
        attempts: 1,
      });
      if (!recoveryId) recoveryUntracked = true;
    };

    const insertInApp = async (userId: string, message: string, actionUrl: string) => {
      // Delivery is retried by its own dead-letter recovery, and a report can
      // be published more than once. Without a key the parent is told their
      // child's report is ready again on every retry.
      //
      // Versioned by the publication timestamp, so re-publishing a corrected
      // report does notify again while recovering a failed send does not.
      const now = new Date().toISOString();
      const delivery = await deliverNotificationsOnce(
        admin,
        [{
          user_id: userId,
          title: subject,
          message,
          type: 'info',
          is_read: false,
          action_url: actionUrl,
          created_at: now,
          updated_at: now,
        }],
        {
          sourceType: 'progress_report_published',
          sourceId: String(report.id),
          version: String((report as any).published_at ?? (report as any).updated_at ?? 'published'),
        },
      );
      if (delivery.error) throw new Error(delivery.error);
      inAppCreated += delivery.created;
    };

    if (student?.id) {
      try {
        await insertInApp(student.id, `Your progress report for ${term} is now available.`, `/dashboard/results?student=${report.student_id}`);
      } catch (error) {
        console.error('[progress-report/delivery] student in-app notification failed:', error);
        failures.push('student_in_app');
        await preserveFailure('in_app', student.id, student.id, {
          userId: student.id,
          title: subject,
          message: `Your progress report for ${term} is now available.`,
          actionUrl: `/dashboard/results?student=${report.student_id}`,
        }, error);
      }
    }

    if (student?.email && !isInAppEmail(student.email)) {
      try {
        const html = buildReportEmail({
          recipientName: studentName,
          studentName,
          term,
          overallGrade: grade,
          portalUrl: studentPortalUrl,
          appUrl,
          trackingPixelUrl: buildEmailTrackingPixelUrl({ appUrl, reportId: report.id, email: student.email }),
        });
        const emailPayload = {
          to: student.email,
          subject,
          fromName: 'Rillcod Technologies',
          fromEmail: SMTP_FROM_EMAIL,
          html,
          eventType: 'progress_report_published',
          templateKey: 'progress_report_published',
          category: 'report_published',
          referenceId: `${report.id}:${student.email.toLowerCase()}`,
          automated: true,
        };
        await queueService.queueNotification(student.id, 'email', emailPayload);
        emailQueued += 1;
      } catch (error) {
        console.error('[progress-report/delivery] student email queue failed:', error);
        failures.push('student_email');
        await preserveFailure('email', student.email, student.id, {
          userId: student.id,
          to: student.email,
          subject,
          fromName: 'Rillcod Technologies',
          fromEmail: SMTP_FROM_EMAIL,
          html: buildReportEmail({ recipientName: studentName, studentName, term, overallGrade: grade, portalUrl: studentPortalUrl, appUrl }),
          eventType: 'progress_report_published',
          templateKey: 'progress_report_published',
          category: 'report_published',
          referenceId: `${report.id}:${student.email.toLowerCase()}`,
          automated: true,
        }, error);
      }
    }

    for (const [email, parent] of emailContacts) {
      if (isInAppEmail(email)) {
        if (parent.userId) {
          try {
            await insertInApp(parent.userId, `${studentName}'s ${term} progress report is now available.`, '/dashboard/parent-results');
          } catch (error) {
            console.error('[progress-report/delivery] parent in-app notification failed:', error);
            failures.push('parent_in_app');
            await preserveFailure('in_app', parent.userId, parent.userId, {
              userId: parent.userId,
              title: subject,
              message: `${studentName}'s ${term} progress report is now available.`,
              actionUrl: '/dashboard/parent-results',
            }, error);
          }
        }
        continue;
      }
      try {
        const html = buildReportEmail({
          recipientName: parent.name,
          studentName,
          term,
          overallGrade: grade,
          portalUrl: verifyUrl,
          appUrl,
          trackingPixelUrl: buildEmailTrackingPixelUrl({ appUrl, reportId: report.id, email }),
        });
        const emailPayload = {
          to: email,
          subject,
          fromName: 'Rillcod Technologies',
          fromEmail: SMTP_FROM_EMAIL,
          html,
          eventType: 'progress_report_published',
          templateKey: 'progress_report_published',
          category: 'report_published',
          referenceId: `${report.id}:${email}`,
          automated: true,
          external: !parent.userId,
        };
        await queueService.queueNotification(parent.userId || report.student_id, 'email', emailPayload);
        emailQueued += 1;
      } catch (error) {
        console.error('[progress-report/delivery] parent email queue failed:', error);
        failures.push('parent_email');
        await preserveFailure('email', email, parent.userId, {
          userId: parent.userId,
          to: email,
          subject,
          fromName: 'Rillcod Technologies',
          fromEmail: SMTP_FROM_EMAIL,
          html: buildReportEmail({ recipientName: parent.name, studentName, term, overallGrade: grade, portalUrl: verifyUrl, appUrl }),
          eventType: 'progress_report_published',
          templateKey: 'progress_report_published',
          category: 'report_published',
          referenceId: `${report.id}:${email}`,
          automated: true,
          external: !parent.userId,
        }, error);
      }
    }

    for (const [phone, parent] of phoneContacts) {
      const queued = await enqueueWhatsApp(admin, {
        recipientUserId: parent.userId,
        phone,
        messageBody: messageForParent(parent.name, studentName, term, grade, verifyUrl),
        sourceType: 'progress_report_published',
        sourceId: report.id,
        schoolId: report.school_id ?? student?.school_id ?? null,
        createdBy: actorId,
        idempotencyKey: `progress-report:${report.id}:${phone.replace(/\D/g, '')}`,
      });
      if (queued.queued) whatsappQueued += 1;
      else {
        console.error('[progress-report/delivery] WhatsApp queue failed:', queued.error);
        failures.push('parent_whatsapp');
        await preserveFailure('whatsapp', phone, parent.userId, {
          recipientUserId: parent.userId,
          phone,
          messageBody: messageForParent(parent.name, studentName, term, grade, verifyUrl),
          sourceType: 'progress_report_published',
          sourceId: report.id,
          schoolId: report.school_id ?? student?.school_id ?? null,
          createdBy: actorId,
          idempotencyKey: `progress-report:${report.id}:${phone.replace(/\D/g, '')}`,
        }, queued.error || 'WhatsApp alert could not be queued');
      }
    }

    const contactCount = emailQueued + whatsappQueued + inAppCreated;
    return {
      status: recoveryUntracked ? 'delivery_failed' : failures.length ? 'partial' : contactCount ? 'queued' : 'no_contacts',
      emailQueued,
      whatsappQueued,
      inAppCreated,
      failures: [...new Set(failures)],
    };
  } catch (error) {
    console.error('[progress-report/delivery] publication delivery setup failed:', error);
    const recoveryId = await recordDeadLetter({
      source: 'progress_report_publication_delivery',
      jobType: 'progress_report_delivery',
      originalJobId: `progress-report:${report.id}`,
      userId: report.student_id,
      payload: { reportId: report.id, actorId },
      error: error instanceof Error ? error.message : String(error),
      attempts: 1,
    });
    return {
      status: recoveryId ? 'recovery_required' : 'delivery_failed',
      emailQueued: 0,
      whatsappQueued: 0,
      inAppCreated: 0,
      failures: ['delivery_setup'],
    };
  }
}
