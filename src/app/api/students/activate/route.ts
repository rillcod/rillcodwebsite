import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { generateTempPassword } from '@/lib/utils/password';
import { ensureStudentCardIssued } from '@/lib/cards/auto-issue';
import { resolveOnlineSchool } from '@/lib/schools/resolve-online-school';
import { ensureDefaultEnrollment } from '@/lib/enrollments/ensure-default-enrollment';
import { generateUniqueStudentLoginEmail } from '@/lib/students/generate-login-email';
import { findOrCreateStudentPortal } from '@/lib/students/provision';
import { cleanGrade } from '@/lib/classes/naming';
import { resolveClassForStudent } from '@/lib/classes/resolve-or-create';
import { studentApprovalPaymentState } from '@/lib/registration/payment-state';
import { isSpecialEnrollment, normalizeEnrollmentType } from '@/lib/registration/enrollment-types';
import { Database as GenDatabase } from '@/types/supabase';
import { deliverActivationCredentials } from '@/lib/credentials/activation-credentials';
import { archivePortalCredential } from '@/lib/credentials/archive-registration-result';
import { ensureParentPortalForStudent } from '@/lib/parents/ensure-parent-portal-account';

interface ParentStudentLinkTable {
  Row: {
    parent_id: string;
    student_id: string;
    updated_at: string | null;
  };
  Insert: {
    parent_id: string;
    student_id: string;
    updated_at?: string | null;
  };
  Update: {
    parent_id?: string;
    student_id?: string;
    updated_at?: string | null;
  };
  Relationships: [];
}

type Database = GenDatabase & {
  public: GenDatabase['public'] & {
    Tables: GenDatabase['public']['Tables'] & {
      parent_student_links: ParentStudentLinkTable;
    };
  };
};

const supabaseAdmin = createAdminClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type StaffCaller = { role: string; id: string; school_id: string | null };

async function callerCanAccessSchool(caller: StaffCaller, schoolId: string | null): Promise<boolean> {
  if (caller.role === 'admin') return true;
  if (!schoolId) return false;
  if (caller.school_id === schoolId) return true;
  if (caller.role !== 'teacher') return false;

  const { data } = await supabaseAdmin
    .from('teacher_schools')
    .select('school_id')
    .eq('teacher_id', caller.id)
    .eq('school_id', schoolId)
    .maybeSingle();
  return !!data;
}

async function findCompletedTransactionForStudent(
  admin: any,
  studentId: string,
  student: any,
  portalUserId: string
) {
  // 1. Try by portal_user_id (already set or existing)
  const { data: byUser } = await admin
    .from('payment_transactions')
    .select('id')
    .eq('portal_user_id', portalUserId)
    .in('payment_status', ['completed', 'success', 'paid'])
    .maybeSingle();
  if (byUser) return byUser;

  // 2. Try by registration paystack reference
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

  // 3. Try by prospect matching
  const parentEmail = student.parent_email?.trim().toLowerCase();
  const sName = student.full_name || student.name;
  if (parentEmail && sName) {
    const { data: prospect } = await admin
      .from('prospective_students')
      .select('id')
      .eq('parent_email', parentEmail)
      .eq('full_name', sName)
      .maybeSingle();

    if (prospect) {
      const { data: txList } = await admin
        .from('payment_transactions')
        .select('id, payment_gateway_response')
        .in('payment_status', ['completed', 'success', 'paid']);

      if (txList) {
        const found = txList.find((t: any) => {
          const gw = (t.payment_gateway_response ?? {}) as any;
          return gw.prospect_id === prospect.id;
        });
        if (found) return found;
      }
    }
  }

  // 4. Try by parent_email in payment_gateway_response
  if (parentEmail) {
    const { data: txList } = await admin
      .from('payment_transactions')
      .select('id, payment_gateway_response')
      .in('payment_status', ['completed', 'success', 'paid']);

    if (txList) {
      const found = txList.find((t: any) => {
        const gw = (t.payment_gateway_response ?? {}) as any;
        const pEmail = (gw.parent_email ?? '').trim().toLowerCase();
        return pEmail === parentEmail;
      });
      if (found) return found;
    }
  }

  // 5. Try by student_name in payment_gateway_response
  if (sName) {
    const { data: txList } = await admin
      .from('payment_transactions')
      .select('id, payment_gateway_response')
      .in('payment_status', ['completed', 'success', 'paid']);

    if (txList) {
      const found = txList.find((t: any) => {
        const gw = (t.payment_gateway_response ?? {}) as any;
        const studentNameStr = (gw.student_name ?? '').trim().toLowerCase();
        return studentNameStr === sName.trim().toLowerCase();
      });
      if (found) return found;
    }
  }

  return null;
}

const bodySchema = z.object({
  studentId: z.string().uuid('Invalid student ID format'),
  classId: z.string().uuid().nullable().optional(),
  forceResend: z.boolean().optional(),
});

// POST /api/students/activate
// Body: { studentId: string }
// Admin/Teacher only — creates a portal_users account for an approved student
// Returns: { success, email, tempPassword, portalUserId }
export async function POST(req: NextRequest) {
  try {
    // Verify caller is admin or teacher
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: caller } = await supabaseAdmin
      .from('portal_users')
      .select('role, id, school_id')
      .eq('id', user.id)
      .single();
    if (!caller || !['admin', 'teacher'].includes(caller.role)) {
      return NextResponse.json({ error: 'Admin or teacher access required' }, { status: 403 });
    }
    const staff = caller as StaffCaller;

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid parameters' }, { status: 400 });
    }
    const { studentId, classId, forceResend } = parsed.data;

    // Fetch the student record
    const { data: student, error: studErr } = await supabaseAdmin
      .from('students')
      .select('id, name, full_name, student_email, parent_email, parent_name, parent_phone, user_id, status, school_id, school_name, enrollment_type, current_class, section, grade_level, course_interest, registration_payment_at, registration_paystack_reference, created_by')
      .eq('id', studentId)
      .single();

    if (studErr || !student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Resolve school — every student must belong to one (shared resolver
    // avoids the duplicate-"Online School" bug and self-heals an un-approved match).
    const resolvedSchool = await resolveOnlineSchool(supabaseAdmin, {
      id: student.school_id,
      name: student.school_name,
    });
    const resolvedSchoolId: string | null = resolvedSchool.id;
    const resolvedSchoolName: string | null = resolvedSchool.name;

    if (!resolvedSchoolId) {
      return NextResponse.json({
        error: 'This student has no school assigned. Assign them to a school before activating their account.',
      }, { status: 400 });
    }

    if (!(await callerCanAccessSchool(staff, resolvedSchoolId))) {
      return NextResponse.json({ error: 'Access denied: this student belongs to a different school' }, { status: 403 });
    }

    if (studentApprovalPaymentState(student) === 'awaiting_payment') {
      return NextResponse.json({
        error: 'Cannot activate: this public registration has no confirmed registration payment yet.',
      }, { status: 400 });
    }

    const originalStudentEmail = student.student_email?.trim();
    const originalParentEmail = student.parent_email?.trim();

    // Determine destination email for credentials notification:
    const destinationEmail = originalParentEmail || originalStudentEmail;
    if (!destinationEmail) {
      return NextResponse.json({
        error: 'No email address on file for this student. Please add student_email or parent_email first.',
      }, { status: 400 });
    }

    // Generate login email in the canonical mike123@rillcod.com style. Reuse the
    // student's existing @rillcod.com login if one was already issued (idempotent).
    let loginEmail = '';
    if (originalStudentEmail && originalStudentEmail.toLowerCase().endsWith('@rillcod.com')) {
      loginEmail = originalStudentEmail;
    } else {
      loginEmail = await generateUniqueStudentLoginEmail(supabaseAdmin, student.full_name || student.name);
    }

    // If already has a portal account, return their info (unless forceResend is true)
    if (student.user_id && !forceResend) {
      const { data: existing } = await supabaseAdmin
        .from('portal_users')
        .select('id, email, class_id')
        .eq('id', student.user_id)
        .single();
      let cardIssued = false;
      let cardId: string | null = null;
      try {
        const card = await ensureStudentCardIssued(supabaseAdmin, {
          holderId: student.user_id,
          schoolId: resolvedSchoolId,
          classId: existing?.class_id ?? null,
          actorId: user.id,
          metadata: { source: 'student_activate_existing', student_id: studentId },
        });
        cardIssued = card.created;
        cardId = card.id;
      } catch (cardErr) {
        console.error('[ActivateStudent] Card ensure failed:', cardErr);
      }
      return NextResponse.json({
        success: true,
        alreadyActivated: true,
        email: existing?.email ?? null,
        portalUserId: student.user_id,
        cardIssued,
        cardId,
        message: 'Student already has a portal account.',
      });
    }

    const tempPassword = generateTempPassword();
    let portalUserId = student.user_id;

    let studentClassId: string | null = null;
    if (portalUserId) {
      const { data: pu } = await supabaseAdmin
        .from('portal_users')
        .select('class_id')
        .eq('id', portalUserId)
        .maybeSingle();
      studentClassId = pu?.class_id ?? null;
    }

    if (isSpecialEnrollment(student.enrollment_type)) {
      try {
        const { ensureSummerClassWithTutor } = await import('@/lib/summer-school/onboard');
        await ensureSummerClassWithTutor(supabaseAdmin, resolvedSchoolId, resolvedSchoolName || 'Online School');
      } catch (err) {
        console.error('[ActivateStudent] ensureSummerClassWithTutor failed:', err);
      }
    }

    const resolvedClass = await resolveClassForStudent(
      supabaseAdmin,
      resolvedSchoolId,
      classId ?? studentClassId ?? null,
      [
        ...(isSpecialEnrollment(student.enrollment_type) ? ['Summer School 2026'] : []),
        student.current_class,
        student.section,
        student.grade_level,
      ],
    );
    if (resolvedClass.error) {
      return NextResponse.json({ error: resolvedClass.error }, { status: 400 });
    }
    const resolvedClassId = resolvedClass.id;
    const resolvedClassName = resolvedClass.name;
    if (!resolvedClassId) {
      return NextResponse.json({
        error: 'Could not resolve a class for this student. Assign a class before activating their account.',
      }, { status: 400 });
    }
    // Specific canonical grade (Basic 2 / JSS 1 …) — kept separate from the class/section so it
    // sticks on the portal account instead of being re-derived from the class band.
    const specificGrade = cleanGrade(student.grade_level) || null;

    const studentProvisioned = await findOrCreateStudentPortal(supabaseAdmin, {
      email: loginEmail,
      fullName: student.full_name || student.name || 'Student',
      schoolId: resolvedSchoolId,
      schoolName: resolvedSchoolName,
      classId: resolvedClassId,
      sectionClass: resolvedClassName,
      grade: specificGrade,
      passwordPolicy: 'reset',
      password: tempPassword,
      existingUserId: portalUserId,
      enrollmentType: normalizeEnrollmentType(student.enrollment_type),
      preserveExistingProfile: false,
      archiveCredentials: false,
    });
    if (!studentProvisioned.ok || !studentProvisioned.studentId) {
      return NextResponse.json({
        error: studentProvisioned.error || 'Failed to provision student portal',
        code: studentProvisioned.status === 409 ? 'EMAIL_ROLE_CONFLICT' : undefined,
      }, { status: studentProvisioned.status || 500 });
    }
    portalUserId = studentProvisioned.studentId;
    const deliveredPassword = studentProvisioned.password || tempPassword;

    // Link student record to portal user + keep grade vs cohort fields distinct
    await supabaseAdmin.from('students').update({
      user_id: portalUserId,
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: user.id,
      student_email: loginEmail,
      parent_email: student.parent_email || originalStudentEmail || null,
      school_id: resolvedSchoolId,
      school_name: resolvedSchoolName,
      enrollment_type: normalizeEnrollmentType(student.enrollment_type),
      ...(specificGrade ? { grade_level: specificGrade, grade: specificGrade } : {}),
      ...(resolvedClassName ? { current_class: resolvedClassName, section: resolvedClassName } : {}),
    }).eq('id', studentId);

    // Resolve and link any completed payment transactions to this portal user
    if (portalUserId) {
      try {
        const tx = await findCompletedTransactionForStudent(supabaseAdmin, studentId, student, portalUserId);
        if (tx) {
          await supabaseAdmin
            .from('payment_transactions')
            .update({ portal_user_id: portalUserId })
            .eq('id', tx.id);
        }
      } catch (txErr) {
        console.error('[ActivateStudent] Failed to link payment transaction:', txErr);
      }
    }

    let cardIssued = false;
    let cardId: string | null = null;
    try {
      const card = await ensureStudentCardIssued(supabaseAdmin, {
        holderId: portalUserId,
        schoolId: resolvedSchoolId,
        actorId: user.id,
        classId: resolvedClassId,
        metadata: { source: 'student_activate', student_id: studentId },
      });
      cardIssued = card.created;
      cardId = card.id;
    } catch (cardErr) {
      console.error('[ActivateStudent] Card auto-issue failed:', cardErr);
    }

    // Give the student a real learning path — enrol into a flagship programme
    // if they have none yet (non-blocking; the dashboard is empty without this).
    void ensureDefaultEnrollment(supabaseAdmin, portalUserId, {
      grade: student.grade_level || student.current_class,
      enrollmentType: normalizeEnrollmentType(student.enrollment_type),
      courseInterest: student.course_interest,
    });

    // --- Bridge Gap: Log to Registration History (Vault) ---
    let regResultId: string | null = null;
    try {
      await archivePortalCredential(supabaseAdmin, {
        schoolId: resolvedSchoolId,
        schoolName: resolvedSchoolName,
        fullName: student.full_name || student.name || '',
        email: loginEmail,
        password: deliveredPassword,
        className: resolvedClassName || null,
        batchLabel: 'Single Student Registrations',
        status: 'created',
      });
      const { data: vaultRow } = await supabaseAdmin
        .from('registration_results')
        .select('id')
        .eq('email', loginEmail.trim().toLowerCase())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      regResultId = vaultRow?.id ?? null;
    } catch (histErr) {
      console.error('[ActivateStudent] Failed to archive credentials in history:', histErr);
      // Non-blocking for the student activation process itself
    }

    let parentLogin: { email: string; password: string } | null = null;
    let parentUserIdForDelivery = portalUserId || student.user_id || '';
    const parentPortal = await ensureParentPortalForStudent(supabaseAdmin, {
      studentRowId: studentId,
      parentEmail: originalParentEmail,
      parentName: student.parent_name,
      schoolId: resolvedSchoolId,
      schoolName: resolvedSchoolName,
      fallbackDeliveryUserId: parentUserIdForDelivery,
    });
    parentLogin = parentPortal.parentLogin;
    parentUserIdForDelivery = parentPortal.parentUserIdForDelivery;

    await deliverActivationCredentials(supabaseAdmin, {
      destinationEmail,
      studentUserId: portalUserId || student.user_id || '',
      studentEmail: loginEmail,
      studentName: student.full_name || student.name || 'Student',
      studentPassword: deliveredPassword,
      parentUserId: parentUserIdForDelivery,
      parentLogin,
      parentName: student.parent_name || 'Parent/Guardian',
      parentPhone: student.parent_phone ?? null,
      schoolId: resolvedSchoolId,
      schoolName: resolvedSchoolName,
      registrationResultId: regResultId,
      isSummerSchool: isSpecialEnrollment(student.enrollment_type),
    });

    return NextResponse.json({
      success: true,
      alreadyActivated: student.user_id ? true : false,
      email: loginEmail,
      tempPassword: deliveredPassword,
      parentLogin: parentLogin ? { email: parentLogin.email, password: parentLogin.password } : null,
      portalUserId,
      cardIssued,
      cardId,
      message: student.user_id
        ? `Credentials successfully reset and resent to ${destinationEmail}.`
        : `Portal account created for ${student.full_name}. Share the credentials with the student.`,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
