/**
 * Retry paid registration onboarding and credential delivery.
 * Summer school uses onboarding-sweep; term paid registrations use this module.
 */
import { deliverActivationCredentials } from '@/lib/credentials/activation-credentials';
import { archivePortalCredential } from '@/lib/credentials/archive-registration-result';
import {
  onboardPaidRegistrationStudent,
  shouldAutoEnrolOnlinePaystack,
} from '@/lib/registration/onboard-paid-student';
import { ensureParentPortalForStudent } from '@/lib/parents/ensure-parent-portal-account';
import { isSpecialEnrollment } from '@/lib/registration/enrollment-types';

type AdminClient = { from: (table: string) => any; auth: { admin: any } };

export type PaidStudentRow = {
  id: string;
  full_name: string | null;
  name: string | null;
  student_email: string | null;
  parent_email: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  user_id: string | null;
  status: string | null;
  school_id: string | null;
  school_name: string | null;
  enrollment_type: string | null;
  current_class: string | null;
  section: string | null;
  registration_payment_at: string | null;
  registration_paystack_reference: string | null;
  approved_at: string | null;
  created_by: string | null;
};

function isPaidPublicRegistration(student: PaidStudentRow): boolean {
  if (student.created_by) return false;
  if (isSpecialEnrollment(student.enrollment_type)) return false;
  return !!(student.registration_payment_at || student.registration_paystack_reference);
}

async function latestVaultStatus(admin: AdminClient, email: string): Promise<{ id: string; status: string } | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const { data } = await admin
    .from('registration_results')
    .select('id, status')
    .eq('email', normalized)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function ensurePaidRegistrationVault(
  admin: AdminClient,
  input: {
    schoolId: string | null;
    schoolName: string | null;
    fullName: string;
    email: string;
    password: string;
    className?: string | null;
  },
): Promise<string | null> {
  await archivePortalCredential(admin as any, {
    schoolId: input.schoolId,
    schoolName: input.schoolName,
    fullName: input.fullName,
    email: input.email,
    password: input.password,
    className: input.className ?? null,
    batchLabel: 'Paid Registration — Auto-Onboard',
    status: 'created',
  });
  const { data } = await admin
    .from('registration_results')
    .select('id')
    .eq('email', input.email.trim().toLowerCase())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/** Pass 1 — paid but never onboarded (pending + no portal user). */
export async function retryUnonboardedPaidStudent(
  admin: AdminClient,
  studentId: string,
): Promise<'onboarded' | 'skipped' | 'failed'> {
  try {
    await onboardPaidRegistrationStudent(admin, {
      studentId,
      actorId: null,
      source: 'paystack_online_auto',
    });
    return 'onboarded';
  } catch (err) {
    console.error('[retryUnonboardedPaidStudent] failed:', studentId, err);
    return 'failed';
  }
}

/** Pass 2 — approved student but credentials missing or failed in vault. */
export async function retryPaidCredentialDelivery(
  admin: AdminClient,
  student: PaidStudentRow,
): Promise<'sent' | 'skipped' | 'failed'> {
  if (!student.user_id) return 'skipped';
  if (!isPaidPublicRegistration(student)) return 'skipped';

  const destinationEmail = (student.parent_email || student.student_email || '').trim().toLowerCase();
  if (!destinationEmail.includes('@')) return 'skipped';

  const { data: portalUser } = await admin
    .from('portal_users')
    .select('email, full_name')
    .eq('id', student.user_id)
    .maybeSingle();
  if (!portalUser?.email) return 'skipped';

  const loginEmail = portalUser.email.trim().toLowerCase();
  const vault = await latestVaultStatus(admin, loginEmail);
  if (vault?.status === 'sent') return 'skipped';

  const { data: authUser } = await admin.auth.admin.getUserById(student.user_id);
  const password = crypto.randomUUID().replace(/-/g, '').slice(0, 12);

  if (!authUser?.user?.last_sign_in_at) {
    await admin.auth.admin.updateUserById(student.user_id, { password });
  }

  let registrationResultId = vault?.id ?? null;
  if (!registrationResultId) {
    registrationResultId = await ensurePaidRegistrationVault(admin, {
      schoolId: student.school_id,
      schoolName: student.school_name,
      fullName: student.full_name || student.name || 'Student',
      email: loginEmail,
      password,
      className: student.current_class || student.section || null,
    });
  } else if (vault?.status !== 'sent') {
    await archivePortalCredential(admin as any, {
      schoolId: student.school_id,
      schoolName: student.school_name,
      fullName: student.full_name || student.name || 'Student',
      email: loginEmail,
      password,
      className: student.current_class || student.section || null,
      batchLabel: 'Paid Registration — Auto-Onboard',
      status: 'created',
    });
  }

  const parentPortal = await ensureParentPortalForStudent(admin as any, {
    studentRowId: student.id,
    parentEmail: student.parent_email,
    parentName: student.parent_name,
    schoolId: student.school_id,
    schoolName: student.school_name,
    fallbackDeliveryUserId: student.user_id,
  });

  const ok = await deliverActivationCredentials(admin as any, {
    destinationEmail,
    studentUserId: student.user_id,
    studentEmail: loginEmail,
    studentName: student.full_name || student.name || 'Student',
    studentPassword: password,
    parentUserId: parentPortal.parentUserIdForDelivery,
    parentLogin: parentPortal.parentLogin,
    parentName: student.parent_name || 'Parent/Guardian',
    parentPhone: student.parent_phone ?? null,
    schoolId: student.school_id,
    schoolName: student.school_name,
    registrationResultId,
    isSummerSchool: false,
  });

  return ok ? 'sent' : 'failed';
}

export function studentNeedsCredentialRetry(
  student: PaidStudentRow,
  vaultStatus: string | null,
): boolean {
  if (!isPaidPublicRegistration(student)) return false;
  if (student.status === 'pending' && !student.user_id) return true;
  if (student.status !== 'approved' || !student.user_id) return false;
  if (!vaultStatus || vaultStatus === 'created' || vaultStatus === 'failed') return true;
  return false;
}

export { isPaidPublicRegistration, shouldAutoEnrolOnlinePaystack };
