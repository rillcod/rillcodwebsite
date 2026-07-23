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
import { SMTP_FROM_EMAIL } from '@/config/brand';
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

async function sendStudentCredentialsEmail(
  admin: AdminClient,
  destinationEmail: string,
  loginEmail: string,
  fullName: string,
  password: string,
  schoolName: string | null,
  portalUserId?: string,
  isSummerSchool?: boolean,
) {
  try {
    const { notificationsService } = await import('@/services/notifications.service');
    const { buildWelcomeEmail } = await import('@/lib/email/rillcod-transactional-email');

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com').replace(/\/$/, '');
    const loginUrl = `${appUrl}/login`;

    const html = buildWelcomeEmail({
      recipientName: fullName,
      role: 'student',
      schoolName: schoolName ?? undefined,
      loginUrl,
      appUrl,
    });

    const credentialsBlock = `
<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:#141618;border:1px solid #2a2d33;border-radius:8px;overflow:hidden;margin:0 0 20px;">
  <tr><td style="background:#1c1e22;border-bottom:1px solid #2a2d33;padding:10px 16px;">
    <p style="margin:0;font-size:10px;color:#71717a;text-transform:uppercase;letter-spacing:1.5px;font-weight:800;">Student Login Credentials</p>
  </td></tr>
  <tr><td style="padding:14px 16px;border-bottom:1px solid #2a2d33;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="font-size:12px;color:#71717a;font-weight:700;width:35%;">Username / Email</td>
        <td style="font-size:13px;color:#ffffff;font-weight:800;text-align:right;font-family:monospace,Arial;">${loginEmail.trim().toLowerCase()}</td>
      </tr>
    </table>
  </td></tr>
  <tr><td style="padding:14px 16px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="font-size:12px;color:#71717a;font-weight:700;width:35%;">Temporary Password</td>
        <td style="font-size:13px;color:#f59e0b;font-weight:800;text-align:right;font-family:monospace,Arial;">${password}</td>
      </tr>
    </table>
  </td></tr>
</table>
<p style="font-size:12px;color:#71717a;margin:0 0 20px;">
  After logging in, please change your password in your profile settings. Do not share these credentials.
</p>`;

    let attachments: Array<{ filename: string; content: string }> | undefined;
    let receiptUrl = '';
    if (portalUserId) {
      try {
        const { data: tx } = await admin
          .from('payment_transactions')
          .select('id')
          .eq('portal_user_id', portalUserId)
          .in('payment_status', ['completed', 'success', 'paid'])
          .order('paid_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (tx?.id) {
          const { paymentsService } = await import('@/services/payments.service');
          const url = await paymentsService.generateReceipt(tx.id);
          receiptUrl = url || '';
          const r = await fetch(url);
          if (r.ok) {
            const buf = Buffer.from(await r.arrayBuffer());
            const safeName = (fullName || 'Student').replace(/[^a-z0-9]+/gi, '_');
            attachments = [{ filename: `Rillcod-Receipt-${safeName}.pdf`, content: buf.toString('base64') }];
          }
        }
      } catch (receiptErr) {
        console.error('[onboardPaidStudent] receipt attachment failed:', receiptErr);
      }
    }

    let waGroupLink = '';
    if (isSummerSchool) {
      try {
        const { getSummerSchoolWhatsAppLink } = await import('@/lib/summer-school/whatsapp-group');
        waGroupLink = (await getSummerSchoolWhatsAppLink()) || '';
      } catch (waErr) {
        console.error('[onboardPaidStudent] WhatsApp group link failed:', waErr);
      }
    }

    const whatsappBlock = waGroupLink
      ? `<div style="margin:0 0 16px;padding:14px 16px;background:#141618;border:1px solid #2a2d33;border-radius:8px;text-align:center;">
           <p style="margin:0 0 8px;font-size:11px;color:#25d366;text-transform:uppercase;letter-spacing:1.5px;font-weight:800;">Class WhatsApp Group</p>
           <p style="margin:0 0 10px;font-size:12px;color:#a1a1aa;">Join the cohort WhatsApp group to receive class links, daily updates, and schedules:</p>
           <a href="${waGroupLink}" style="display:inline-block;padding:9px 20px;background:#25d366;color:#fff;font-size:13px;font-weight:800;text-decoration:none;border-radius:8px;">Join WhatsApp Group →</a>
         </div>`
      : '';

    const receiptBlock = receiptUrl
      ? `<div style="margin:0 0 16px;padding:14px 16px;background:#141618;border:1px solid #2a2d33;border-radius:8px;text-align:center;">
           <p style="margin:0 0 8px;font-size:11px;color:#10b981;text-transform:uppercase;letter-spacing:1px;font-weight:800;">Payment Receipt</p>
           <p style="margin:0 0 10px;font-size:12px;color:#a1a1aa;">${attachments ? 'Your receipt is attached as a PDF.' : 'Your payment receipt is ready.'} View or download any time:</p>
           <a href="${receiptUrl}" style="display:inline-block;padding:9px 20px;background:#10b981;color:#fff;font-size:13px;font-weight:800;text-decoration:none;border-radius:8px;">View / Download Receipt →</a>
         </div>`
      : '';

    const finalHtml = html.replace('</body>', `${credentialsBlock}${receiptBlock}${whatsappBlock}</body>`);

    await notificationsService.sendExternalEmail({
      to: destinationEmail.trim().toLowerCase(),
      subject: `Your Rillcod Academy Login Credentials`,
      html: finalHtml,
      fromName: 'Rillcod Technologies',
      fromEmail: SMTP_FROM_EMAIL,
      ...(attachments ? { attachments } : {}),
    });
  } catch (err) {
    console.error('Failed to send student credentials email:', err);
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
  void sendStudentCredentialsEmail(
    admin,
    destinationEmail,
    loginEmail,
    student.full_name || student.name || 'Student',
    password,
    resolvedSchoolName,
    portalUserId,
    isSummerStudent,
  );

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
