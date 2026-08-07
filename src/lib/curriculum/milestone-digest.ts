import { createAdminClient } from '@/lib/supabase/admin';
import { notificationsService } from '@/services/notifications.service';

export type MilestoneDigestInput = {
  classId?: string | null;
  schoolId?: string | null;
  curriculumId?: string | null;
  termNumber: number;
  weekNumber: number;
  weekTopic?: string | null;
  courseTitle?: string | null;
  channels?: Array<'email' | 'whatsapp' | 'in_app'>;
};

const SMTP_FROM_EMAIL = process.env.SMTP_FROM_EMAIL || 'support@rillcod.com';

/**
 * Sends automated parent progress digests when a teacher completes a curriculum week milestone.
 * Supports Email, queued WhatsApp Outbox, and In-App Notifications.
 */
export async function triggerWeeklyMilestoneDigest(opts: MilestoneDigestInput): Promise<{
  success: boolean;
  notifiedParentsCount: number;
  whatsappQueuedCount: number;
  emailsSentCount: number;
}> {
  const admin = createAdminClient() as any;
  const channels = opts.channels ?? ['email', 'whatsapp', 'in_app'];

  // 1. Resolve student parent details either by classId or schoolId
  // A learner's class is portal_users.class_id. `students` has no class_id and
  // `class_enrollments` has never existed, so both halves of this lookup were
  // rejected by the database — the embed with "column students_1.class_id does
  // not exist", the roster with "Could not find the table
  // public.class_enrollments". The errors were discarded, studentQuery matched
  // nobody, and the digest reported success having messaged no one. A parent
  // notifier that silently notifies nobody looks identical to a quiet week.
  let studentQuery = admin.from('portal_users').select(`
    id,
    full_name,
    student_id,
    school_id,
    class_id,
    students!portal_users_student_id_fkey (
      id,
      parent_name,
      parent_phone,
      parent_email
    )
  `).eq('role', 'student');

  if (opts.classId) {
    // Filtered directly rather than via a roster round-trip. The old code fell
    // back to the whole school when the roster came back empty, which for a
    // caller that named one class is worse than sending nothing: every parent
    // in the school would get a digest about another class's week.
    studentQuery = studentQuery.eq('class_id', opts.classId);
  } else if (opts.schoolId) {
    studentQuery = studentQuery.eq('school_id', opts.schoolId);
  }

  const { data: students, error: studentErr } = await studentQuery.limit(300);

  if (studentErr || !students?.length) {
    return { success: true, notifiedParentsCount: 0, whatsappQueuedCount: 0, emailsSentCount: 0 };
  }

  const TERM_LABELS: Record<number, string> = { 1: 'First Term', 2: 'Second Term', 3: 'Third Term' };
  const termLabel = TERM_LABELS[opts.termNumber] ?? `Term ${opts.termNumber}`;
  const topicSuffix = opts.weekTopic ? ` — *${opts.weekTopic}*` : '';
  const courseName = opts.courseTitle ?? 'Curriculum';

  let emailsSent = 0;
  let whatsappQueued = 0;

  for (const student of students) {
    const studentInfo = Array.isArray(student.students) ? student.students[0] : student.students;
    const parentPhone = studentInfo?.parent_phone;
    const parentEmail = studentInfo?.parent_email;
    const parentName = studentInfo?.parent_name || 'Parent';
    const studentName = student.full_name || 'Your child';

    // A. WhatsApp Message via whatsapp_outbox queue
    if (channels.includes('whatsapp') && parentPhone) {
      const cleanPhone = String(parentPhone).replace(/\D+/g, '').replace(/^0/, '234');
      const waText = `✅ *Rillcod Academy Milestone Update*\n\nDear ${parentName},\n${studentName} has completed *${termLabel} Week ${opts.weekNumber}* in *${courseName}*${topicSuffix}.\n\nGreat milestone progress! 🎉`;
      
      try {
        await admin.from('whatsapp_outbox').insert({
          phone_number: cleanPhone,
          message_text: waText,
          status: 'pending',
          metadata: {
            type: 'milestone_digest',
            student_id: student.id,
            week_number: opts.weekNumber,
          },
          created_at: new Date().toISOString(),
        });
        whatsappQueued++;
      } catch (err) {
        console.error('[milestone-digest] whatsapp enqueue failed:', err);
      }
    }

    // B. Email Notification
    if (channels.includes('email') && parentEmail) {
      const subject = `🎉 ${studentName} completed Week ${opts.weekNumber} — ${courseName}`;
      const htmlBody = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; max-width:600px; margin:0 auto; padding:24px; border:1px solid #e2e8f0; rounded-3xl:16px;">
          <h2 style="color:#e11d48; margin-top:0;">Rillcod Academy Progress Digest</h2>
          <p>Dear ${parentName},</p>
          <p>We are excited to share that <b>${studentName}</b> has successfully completed <b>${termLabel} Week ${opts.weekNumber}</b> in <b>${courseName}</b>.</p>
          ${opts.weekTopic ? `<blockquote style="background:#f8fafc; padding:12px 16px; border-left:4px solid #e11d48; margin:16px 0; font-style:italic;">Topic: ${opts.weekTopic}</blockquote>` : ''}
          <p>Thank you for supporting your child's tech journey!</p>
          <hr style="border:none; border-top:1px solid #e2e8f0; margin:24px 0;" />
          <p style="font-size:12px; color:#64748b;">— Rillcod Technologies Academic Team</p>
        </div>
      `;

      try {
        await notificationsService.sendExternalEmail({
          to: parentEmail,
          subject,
          html: htmlBody,
          fromName: 'Rillcod Academy',
          fromEmail: SMTP_FROM_EMAIL,
        });
        emailsSent++;
      } catch (err) {
        console.error('[milestone-digest] email send failed:', err);
      }
    }

    // C. In-App Parent Notification
    if (channels.includes('in_app')) {
      try {
        const now = new Date().toISOString();
        await admin.from('notifications').insert({
          user_id: student.id,
          title: `Week ${opts.weekNumber} Completed: ${courseName}`,
          message: `${studentName} completed ${termLabel} Week ${opts.weekNumber}${opts.weekTopic ? ` (${opts.weekTopic})` : ''}.`,
          type: 'success',
          action_url: '/dashboard/my-children',
          is_read: false,
          created_at: now,
          updated_at: now,
        });
      } catch (err) {
        console.error('[milestone-digest] in-app notification failed:', err);
      }
    }
  }

  return {
    success: true,
    notifiedParentsCount: students.length,
    whatsappQueuedCount: whatsappQueued,
    emailsSentCount: emailsSent,
  };
}
