import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { generateTempPassword } from '@/lib/utils/password';
import { ensureStudentCardIssued } from '@/lib/cards/auto-issue';
import { resolveOnlineSchool } from '@/lib/schools/resolve-online-school';
import { ensureDefaultEnrollment } from '@/lib/enrollments/ensure-default-enrollment';
import { generateUniqueStudentLoginEmail } from '@/lib/students/generate-login-email';
import { cleanGrade } from '@/lib/classes/naming';
import { resolveClassForStudent } from '@/lib/classes/resolve-or-create';
import { studentApprovalPaymentState } from '@/lib/registration/payment-state';
import { isSpecialEnrollment, normalizeEnrollmentType } from '@/lib/registration/enrollment-types';
import crypto from 'crypto';
import { Database as GenDatabase } from '@/types/supabase';
import { deliverActivationCredentials } from '@/lib/credentials/activation-credentials';
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
  if (!schoolId) return true;
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
    const studentMeta = {
      full_name: student.full_name,
      role: 'student',
      school_id: resolvedSchoolId,
      class_id: resolvedClassId,
    };

    if (portalUserId) {
      // Reset password of the existing auth user
      const { error: resetErr } = await supabaseAdmin.auth.admin.updateUserById(portalUserId, {
        password: tempPassword,
        user_metadata: studentMeta,
      });

      if (resetErr) {
        return NextResponse.json({ error: `Failed to reset password: ${resetErr.message}` }, { status: 500 });
      }

      // Update portal_users profile
      const portalUpdate: Database['public']['Tables']['portal_users']['Update'] = {
        is_active: true,
        school_id: resolvedSchoolId,
        school_name: resolvedSchoolName,
        class_id: resolvedClassId,
        section_class: resolvedClassName,
        ...(specificGrade ? { grade: specificGrade } : {}),
        updated_at: new Date().toISOString(),
      };
      await supabaseAdmin.from('portal_users').update(portalUpdate).eq('id', portalUserId);
    } else {
      // Check if this generated email already has a portal account
      const { data: existingPortal } = await supabaseAdmin
        .from('portal_users')
        .select('id')
        .eq('email', loginEmail)
        .maybeSingle();
      if (existingPortal) {
        return NextResponse.json({
          error: `An account with email ${loginEmail} already exists. If this is the student, update their user_id link manually.`,
        }, { status: 409 });
      }

      // Create auth user (auto email-confirmed, no email sent)
      const { data: authData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: loginEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: studentMeta,
      });

      if (createErr || !authData.user) {
        return NextResponse.json({ error: createErr?.message ?? 'Failed to create auth account' }, { status: 400 });
      }

      portalUserId = authData.user.id;

      // Create portal_users profile
      const { error: profileErr } = await supabaseAdmin.from('portal_users').insert({
        id: portalUserId,
        email: loginEmail,
        full_name: student.full_name || student.name || '',
        role: 'student',
        is_active: true,
        school_id: resolvedSchoolId,
        school_name: resolvedSchoolName,
        class_id: resolvedClassId,
        enrollment_type: normalizeEnrollmentType(student.enrollment_type),
        section_class: resolvedClassName,
        ...(specificGrade ? { grade: specificGrade } : {}),
        created_at: new Date().toISOString(),
      });

      if (profileErr) {
        // Rollback auth user
        await supabaseAdmin.auth.admin.deleteUser(portalUserId);
        return NextResponse.json({ error: profileErr.message }, { status: 400 });
      }
    }

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
      const singleBatchName = 'Single Student Registrations';
      // Check if a dedicated batch for single student registrations exists for this school and creator
      const { data: existingBatch } = await supabaseAdmin
        .from('registration_batches')
        .select('id, student_count')
        .eq('school_id', resolvedSchoolId)
        .eq('created_by', user.id)
        .eq('class_name', singleBatchName)
        .maybeSingle();

      let batchId: string;

      if (!existingBatch) {
        batchId = crypto.randomUUID();
        await supabaseAdmin.from('registration_batches').insert({
          id: batchId,
          created_by: user.id,
          school_id: resolvedSchoolId,
          school_name: resolvedSchoolName,
          class_name: singleBatchName,
          student_count: 1,
        });
      } else {
        batchId = existingBatch.id;
        await supabaseAdmin
          .from('registration_batches')
          .update({ student_count: (existingBatch.student_count ?? 0) + 1 })
          .eq('id', batchId);
      }

      // Record this single registration inside the results history table
      const { data: insertedResult } = await supabaseAdmin.from('registration_results').insert({
        batch_id: batchId,
        full_name: student.full_name || student.name || '',
        email: loginEmail,
        password: tempPassword,
        class_name: resolvedClassName || null,
        status: 'created',
      }).select('id').single();
      regResultId = insertedResult?.id ?? null;
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
      studentPassword: tempPassword,
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
      tempPassword,
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
