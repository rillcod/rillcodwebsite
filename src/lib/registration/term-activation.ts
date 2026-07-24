/**
 * Term registration (online + partner school) activation emails —
 * mirrors sendSpecialProgramActivation for the students-table path.
 */
import { deliverActivationCredentials } from '@/lib/credentials/activation-credentials';
import { ensureParentPortalForStudent } from '@/lib/parents/ensure-parent-portal-account';

type AdminClient = { from: (table: string) => any; auth: { admin: any } };

export type TermActivationStudent = {
  id: string;
  full_name?: string | null;
  name?: string | null;
  student_email?: string | null;
  parent_email?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  user_id?: string | null;
  school_id?: string | null;
  school_name?: string | null;
  enrollment_type?: string | null;
};

export async function sendTermRegistrationActivation(
  admin: AdminClient,
  student: TermActivationStudent,
  opts: { force?: boolean; tempPassword?: string | null } = {},
): Promise<{ email: boolean; whatsapp: boolean; alreadySent?: boolean }> {
  const studentUserId = student.user_id?.trim();
  if (!studentUserId) return { email: false, whatsapp: false };

  const destinationEmail = (student.parent_email || student.student_email || '').trim().toLowerCase();
  if (!destinationEmail.includes('@')) return { email: false, whatsapp: false };

  const externalId = `term_activation:${student.id}`;
  if (!opts.force) {
    const { data: previousDelivery } = await admin
      .from('notifications')
      .select('id')
      .eq('external_id', externalId)
      .eq('delivery_status', 'sent')
      .limit(1)
      .maybeSingle();
    if (previousDelivery) {
      return { email: true, whatsapp: false, alreadySent: true };
    }
  }

  const { data: portalUser } = await admin
    .from('portal_users')
    .select('email, full_name')
    .eq('id', studentUserId)
    .maybeSingle();
  const loginEmail = (portalUser?.email || student.student_email || '').trim().toLowerCase();
  if (!loginEmail) return { email: false, whatsapp: false };

  const parentPortal = await ensureParentPortalForStudent(admin as any, {
    studentRowId: student.id,
    parentEmail: student.parent_email,
    parentName: student.parent_name,
    schoolId: student.school_id ?? null,
    schoolName: student.school_name ?? null,
    fallbackDeliveryUserId: studentUserId,
  });

  const isOnline = String(student.enrollment_type || '').toLowerCase() === 'online';
  const studentName = student.full_name || student.name || 'Student';
  const enrollLabel = isOnline ? 'Online programme' : 'Partner school programme';

  const delivered = await deliverActivationCredentials(admin as any, {
    destinationEmail,
    studentUserId,
    studentEmail: loginEmail,
    studentName,
    studentPassword: opts.tempPassword || '',
    parentUserId: parentPortal.parentUserIdForDelivery,
    parentLogin: parentPortal.parentLogin,
    parentName: student.parent_name || 'Parent/Guardian',
    parentPhone: student.parent_phone ?? null,
    schoolId: student.school_id ?? null,
    schoolName: student.school_name ?? null,
    isSummerSchool: false,
    activation: true,
    force: opts.force,
    emailSubject: `You're activated — Rillcod ${enrollLabel} (${studentName})`,
    title: 'Your Rillcod portal is active!',
    bodyIntro: `Dear ${student.parent_name || 'Parent/Guardian'}, ${studentName}'s registration is confirmed and portal access is ready.`,
  });

  if (delivered) {
    try {
      await admin.from('notifications').insert({
        user_id: null,
        title: 'Term registration activation delivered',
        message: `${studentName} | ${destinationEmail}`,
        type: 'success',
        notification_channel: 'email',
        delivery_status: 'sent',
        retry_count: 0,
        sent_at: new Date().toISOString(),
        external_id: externalId,
        action_url: '/dashboard/approvals',
      });
    } catch (trackErr) {
      console.error('[term-activation] delivery tracking failed:', trackErr);
    }
  }

  return { email: delivered, whatsapp: false };
}
