/**
 * Shared post-payment onboarding for term registrations (approve path + Paystack
 * auto-enrol for online). Creates portal login, places class, enrols programme,
 * emails credentials.
 */
import { resolveOnlineSchool } from '@/lib/schools/resolve-online-school';
import { ensureDefaultEnrollment } from '@/lib/enrollments/ensure-default-enrollment';
import { generateUniqueStudentLoginEmail } from '@/lib/students/generate-login-email';
import { generateTempPassword } from '@/lib/utils/password';
import { cleanGrade } from '@/lib/classes/naming';
import { logAudit } from '@/lib/audit/log';
import { deliverActivationCredentials } from '@/lib/credentials/activation-credentials';
import { archivePortalCredential } from '@/lib/credentials/archive-registration-result';
import { finalizeStudentOnboard } from '@/lib/students/finalize-student-onboard';
import { ensureParentPortalForStudent } from '@/lib/parents/ensure-parent-portal-account';
import { isSpecialEnrollment, normalizeEnrollmentType } from '@/lib/registration/enrollment-types';

type AdminClient = { from: (table: string) => any; auth: { admin: any } };

export type OnboardPaidStudentResult = {
  portalUserId: string;
  loginEmail: string;
  password: string;
  schoolName: string | null;
  enrollmentType: string;
  autoEnrolled: boolean;
};

async function resolveStudentClassId(
  admin: AdminClient,
  schoolId: string | null,
  schoolName: string | null,
  classNames: Array<string | null | undefined>,
  programme?: string | null,
  grade?: string | null,
): Promise<string | null> {
  const names = Array.from(new Set(classNames.map((name) => name?.trim()).filter(Boolean))) as string[];
  if (!schoolId) return null;

  if (names.length > 0) {
    const { data } = await admin
      .from('classes')
      .select('id')
      .eq('school_id', schoolId)
      .in('name', names)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }

  const className = (programme || '').replace(/\(.*?\)/g, '').trim() || grade?.trim() || names[0] || null;
  if (!className) return null;
  try {
    const { ensureClassWithTutor } = await import('@/lib/summer-school/onboard');
    return await ensureClassWithTutor(admin as any, schoolId, schoolName || '', className, undefined, grade ?? null);
  } catch (err) {
    console.error('[onboardPaidStudent] auto-create class failed:', err);
    return null;
  }
}

async function findCompletedTransactionForStudent(
  admin: AdminClient,
  studentId: string,
  student: any,
  portalUserId: string,
) {
  const { data: byUser } = await admin
    .from('payment_transactions')
    .select('id')
    .eq('portal_user_id', portalUserId)
    .in('payment_status', ['completed', 'success', 'paid'])
    .maybeSingle();
  if (byUser) return byUser;

  const ref = student.registration_paystack_reference?.trim();
  if (ref) {
    const { data: byRef } = await admin
      .from('payment_transactions')
      .select('id')
      .eq('transaction_reference', ref)
      .in('payment_status', ['completed', 'success', 'paid'])
      .maybeSingle();
    if (byRef) return byRef;
  }

  if (studentId) {
    const { data: txList } = await admin
      .from('payment_transactions')
      .select('id, payment_gateway_response')
      .in('payment_status', ['completed', 'success', 'paid']);

    if (txList) {
      const found = txList.find((t: any) => {
        const gw = (t.payment_gateway_response ?? {}) as any;
        return gw.student_id === studentId || gw.subject_id === studentId;
      });
      if (found) return found;
    }
  }

  return null;
}

/**
 * Activate a paid registration student (portal + class + programme enrol + credentials).
 * Used by staff Approvals and by Paystack auto-enrol for online.
 */
export async function onboardPaidRegistrationStudent(
  admin: AdminClient,
  opts: {
    studentId: string;
    actorId: string | null;
    /** When true, skip if already approved (idempotent webhook/verify). */
    source?: 'staff_approve' | 'paystack_online_auto';
  },
): Promise<OnboardPaidStudentResult> {
  const { studentId, actorId, source = 'staff_approve' } = opts;

  const { data: student, error: fetchErr } = await admin
    .from('students')
    .select('id, name, full_name, student_email, parent_email, parent_name, parent_phone, user_id, status, school_id, school_name, enrollment_type, current_class, section, grade_level, course_interest, registration_payment_at, registration_paystack_reference, date_of_birth')
    .eq('id', studentId)
    .maybeSingle();

  if (fetchErr || !student) {
    throw new Error(fetchErr?.message || 'Student not found');
  }

  if (student.status === 'approved' && student.user_id) {
    if (source === 'staff_approve') {
      try {
        const { sendTermRegistrationActivation } = await import('@/lib/registration/term-activation');
        await sendTermRegistrationActivation(admin as any, student as any, { force: true });
      } catch (activationErr) {
        console.error('[onboardPaidStudent] activation resend on approve failed:', activationErr);
      }
    }
    try {
      const { finalizeEnrollmentIntake } = await import('@/lib/crm/intake-capture');
      await finalizeEnrollmentIntake(admin as any, {
        channel: 'portal_registration',
        parentName: student.parent_name || 'Parent/Guardian',
        parentEmail: student.parent_email || null,
        parentPhone: student.parent_phone || null,
        studentName: student.full_name || student.name || 'Student',
        studentPortalUserId: student.user_id,
        studentRowId: studentId,
        schoolName: student.school_name || null,
        className: student.current_class || student.section || null,
        programTitle: student.course_interest || null,
        courseInterest: student.course_interest || null,
      });
    } catch (intakeErr) {
      console.error('[onboardPaidStudent] intake reconcile (idempotent) failed:', intakeErr);
    }
    return {
      portalUserId: student.user_id,
      loginEmail: student.student_email || '',
      password: '',
      schoolName: student.school_name || null,
      enrollmentType: student.enrollment_type || 'online',
      autoEnrolled: source === 'paystack_online_auto',
    };
  }

  const originalStudentEmail = student.student_email?.trim();
  const originalParentEmail = student.parent_email?.trim();
  const destinationEmail = originalParentEmail || originalStudentEmail;
  if (!destinationEmail) {
    throw new Error('Student has no email address on file');
  }

  let loginEmail = '';
  if (originalStudentEmail && originalStudentEmail.toLowerCase().endsWith('@rillcod.com')) {
    loginEmail = originalStudentEmail;
  } else {
    loginEmail = await generateUniqueStudentLoginEmail(admin as any, student.full_name || student.name || '');
  }

  const password = generateTempPassword();
  const normalizedEmail = loginEmail.trim().toLowerCase();

  const resolvedSchool = await resolveOnlineSchool(admin as any, {
    id: student.school_id,
    name: student.school_name,
  });
  const resolvedSchoolId: string | null = resolvedSchool.id;
  const resolvedSchoolName: string | null = resolvedSchool.name;

  const specificGrade = cleanGrade(student.grade_level) || cleanGrade(student.current_class) || null;

  const isSummerStudent = isSpecialEnrollment(student.enrollment_type)
    || /summer/i.test(student.current_class ?? '')
    || /summer/i.test(student.grade_level ?? '');

  if (isSummerStudent && resolvedSchoolId) {
    try {
      const { ensureSummerClassWithTutor } = await import('@/lib/summer-school/onboard');
      await ensureSummerClassWithTutor(admin as any, resolvedSchoolId, resolvedSchoolName || 'Online School');
    } catch (err) {
      console.error('[onboardPaidStudent] ensureSummerClassWithTutor failed:', err);
    }
  }

  const resolvedClassId = await resolveStudentClassId(
    admin,
    resolvedSchoolId,
    resolvedSchoolName,
    [
      ...(isSummerStudent ? ['Summer School 2026'] : []),
      student.current_class,
      student.section,
    ],
    isSummerStudent ? 'AI Summer School' : (student.course_interest ?? null),
    specificGrade,
  );

  let resolvedClassName: string | null = null;
  if (resolvedClassId) {
    const { data: cls } = await admin.from('classes').select('name').eq('id', resolvedClassId).maybeSingle();
    resolvedClassName = (cls as { name?: string } | null)?.name ?? null;
  }
  if (!resolvedClassName && isSummerStudent) resolvedClassName = 'Summer School 2026';

  const effectiveEnrollmentType = isSummerStudent
    ? 'special'
    : normalizeEnrollmentType(student.enrollment_type);
  const approvedBy = actorId;
  const approvedAt = new Date().toISOString();

  const { data: existingPortal } = await admin
    .from('portal_users')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  let portalUserId: string;
  let linkedExisting = false;

  if (existingPortal) {
    portalUserId = existingPortal.id;
    linkedExisting = true;
    const { error: updateErr } = await admin.from('portal_users').update({
      role: 'student',
      full_name: student.full_name,
      school_name: resolvedSchoolName,
      school_id: resolvedSchoolId,
      class_id: resolvedClassId,
      enrollment_type: effectiveEnrollmentType,
      date_of_birth: student.date_of_birth || null,
      section_class: resolvedClassName,
      ...(specificGrade ? { grade: specificGrade } : {}),
      is_active: true,
      updated_at: new Date().toISOString(),
    }).eq('id', existingPortal.id);

    if (updateErr) throw new Error(`Failed to link portal account: ${updateErr.message}`);

    await admin.auth.admin.updateUserById(existingPortal.id, {
      password,
      user_metadata: { full_name: student.full_name, role: 'student' },
    });
  } else {
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email: loginEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: student.full_name,
        role: 'student',
      },
    });

    let authUserId: string | null = null;
    if (authErr) {
      if (!authErr.message.includes('already been registered') && !authErr.message.includes('already exists')) {
        throw new Error(`Auth creation failed: ${authErr.message}`);
      }
      const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const existing = listData?.users?.find(
        (u: any) => u.email?.trim().toLowerCase() === normalizedEmail,
      );
      if (existing) {
        authUserId = existing.id;
        await admin.auth.admin.updateUserById(authUserId, {
          password,
          user_metadata: { full_name: student.full_name, role: 'student' },
        });
      }
    } else {
      authUserId = authData?.user?.id ?? null;
    }

    if (!authUserId) throw new Error('Could not resolve auth user ID');
    portalUserId = authUserId;

    const { error: portalErr } = await admin.from('portal_users').upsert({
      id: authUserId,
      email: normalizedEmail,
      full_name: student.full_name,
      role: 'student',
      school_name: resolvedSchoolName,
      school_id: resolvedSchoolId,
      class_id: resolvedClassId,
      enrollment_type: effectiveEnrollmentType,
      date_of_birth: student.date_of_birth || null,
      section_class: resolvedClassName,
      ...(specificGrade ? { grade: specificGrade } : {}),
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (portalErr) throw new Error(`Portal account synchronization failed: ${portalErr.message}`);
  }

  await admin.from('students').update({
    user_id: portalUserId,
    status: 'approved',
    approved_by: approvedBy,
    approved_at: approvedAt,
    student_email: loginEmail,
    parent_email: student.parent_email || originalStudentEmail || null,
    enrollment_type: effectiveEnrollmentType,
    school_id: resolvedSchoolId,
    school_name: resolvedSchoolName,
    ...(specificGrade ? { grade_level: specificGrade, grade: specificGrade } : {}),
    ...(resolvedClassName ? { current_class: resolvedClassName, section: resolvedClassName } : {}),
  }).eq('id', studentId);

  try {
    const tx = await findCompletedTransactionForStudent(admin, studentId, student, portalUserId);
    if (tx) {
      await admin
        .from('payment_transactions')
        .update({ portal_user_id: portalUserId })
        .eq('id', tx.id);
    }
  } catch (txErr) {
    console.error('[onboardPaidStudent] Failed to link payment transaction:', txErr);
  }

  void ensureDefaultEnrollment(admin as any, portalUserId, {
    grade: specificGrade,
    enrollmentType: effectiveEnrollmentType,
    courseInterest: student.course_interest || null,
  });

  let linkedParentId: string | null = null;
  if (originalParentEmail) {
    const { data: parentPu } = await admin
      .from('portal_users')
      .select('id')
      .eq('email', originalParentEmail.trim().toLowerCase())
      .eq('role', 'parent')
      .maybeSingle();
    linkedParentId = parentPu?.id ?? null;
  }
  void finalizeStudentOnboard(admin as any, {
    studentPortalId: portalUserId,
    studentRowId: studentId,
    parentId: linkedParentId,
    grade: specificGrade,
    enrollmentType: effectiveEnrollmentType,
    courseInterest: student.course_interest || null,
  });

  let registrationResultId: string | null = null;
  try {
    await archivePortalCredential(admin as any, {
      schoolId: resolvedSchoolId,
      schoolName: resolvedSchoolName,
      fullName: student.full_name || student.name || 'Student',
      email: loginEmail,
      password,
      className: resolvedClassName,
      batchLabel: 'Paid Registration — Auto-Onboard',
      status: 'created',
    });
    const { data: vaultRow } = await admin
      .from('registration_results')
      .select('id')
      .eq('email', loginEmail.trim().toLowerCase())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    registrationResultId = vaultRow?.id ?? null;
  } catch (vaultErr) {
    console.error('[onboardPaidStudent] credential vault archive failed:', vaultErr);
  }

  const parentPortal = await ensureParentPortalForStudent(admin as any, {
    studentRowId: studentId,
    parentEmail: originalParentEmail,
    parentName: student.parent_name,
    schoolId: resolvedSchoolId,
    schoolName: resolvedSchoolName,
    fallbackDeliveryUserId: linkedParentId || portalUserId,
  });

  try {
    await deliverActivationCredentials(admin as any, {
      destinationEmail,
      studentUserId: portalUserId,
      studentEmail: loginEmail,
      studentName: student.full_name || student.name || 'Student',
      studentPassword: password,
      parentUserId: parentPortal.parentUserIdForDelivery,
      parentLogin: parentPortal.parentLogin,
      parentName: student.parent_name || 'Parent/Guardian',
      parentPhone: student.parent_phone ?? null,
      schoolId: resolvedSchoolId,
      schoolName: resolvedSchoolName,
      registrationResultId,
      isSummerSchool: isSummerStudent,
      activation: true,
    });
  } catch (credErr) {
    console.error('[onboardPaidStudent] credential delivery failed:', credErr);
  }

  await logAudit(admin as any, {
    action: 'student.registration_approved',
    actorId: actorId,
    resourceType: 'students',
    resourceId: studentId,
    newValue: `${source === 'paystack_online_auto' ? 'Auto-enrolled' : 'Approved'} ${student.full_name || student.name || 'student'}${resolvedSchoolName ? ` at ${resolvedSchoolName}` : ''}`,
    newValues: {
      summary: `${source === 'paystack_online_auto' ? 'Paystack auto-enrol' : 'Approved'} for ${student.full_name || student.name || 'student'}${resolvedSchoolName ? ` at ${resolvedSchoolName}` : ''}`,
      student_name: student.full_name || student.name || null,
      school_name: resolvedSchoolName || null,
      portal_user_id: portalUserId,
      school_id: resolvedSchoolId,
      enrollment_type: effectiveEnrollmentType,
      linked_existing_account: linkedExisting,
      source,
    },
  });

  try {
    const { finalizeEnrollmentIntake } = await import('@/lib/crm/intake-capture');
    await finalizeEnrollmentIntake(admin as any, {
      channel: isSummerStudent ? 'special_program' : 'portal_registration',
      parentName: student.parent_name || 'Parent/Guardian',
      parentEmail: student.parent_email || originalParentEmail || null,
      parentPhone: student.parent_phone || null,
      studentName: student.full_name || student.name || 'Student',
      studentPortalUserId: portalUserId,
      studentRowId: studentId,
      schoolName: resolvedSchoolName,
      className: resolvedClassName || student.current_class || null,
      programTitle: student.course_interest || null,
      courseInterest: student.course_interest || null,
    });
  } catch (intakeErr) {
    console.error('[onboardPaidStudent] intake finalize failed:', intakeErr);
  }

  return {
    portalUserId,
    loginEmail,
    password,
    schoolName: resolvedSchoolName,
    enrollmentType: effectiveEnrollmentType,
    autoEnrolled: source === 'paystack_online_auto',
  };
}

/** Online + Paystack only — school / in_person stay on staff Approvals. */
export function shouldAutoEnrolOnlinePaystack(
  enrollmentType: string | null | undefined,
  paymentMethod: string | null | undefined,
): boolean {
  return String(enrollmentType || '').toLowerCase() === 'online'
    && String(paymentMethod || '').toLowerCase() === 'paystack';
}
