import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { generateTempPassword } from '@/lib/utils/password';
import { ensureStudentCardIssued } from '@/lib/cards/auto-issue';
import { resolveOnlineSchool } from '@/lib/schools/resolve-online-school';
import { ensureDefaultEnrollment } from '@/lib/enrollments/ensure-default-enrollment';
import { generateUniqueStudentLoginEmail } from '@/lib/students/generate-login-email';
import { cleanClassName, cleanGrade } from '@/lib/classes/naming';
import { syncExplicitParentStudentLink } from '@/lib/parents/links';
import { studentApprovalPaymentState } from '@/lib/registration/payment-state';
import crypto from 'crypto';
import { Database as GenDatabase } from '@/types/supabase';
import { SMTP_FROM_EMAIL } from '@/config/brand';

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

async function resolveClassForStudent(
  schoolId: string | null,
  classId: string | null,
  classNames: Array<string | null | undefined>,
): Promise<{ id: string | null; name: string | null; error?: string }> {
  if (classId) {
    const { data: cls } = await supabaseAdmin
      .from('classes')
      .select('id, name, school_id')
      .eq('id', classId)
      .maybeSingle();
    if (!cls) return { id: null, name: null, error: 'Class not found' };
    if (schoolId && cls.school_id && cls.school_id !== schoolId) {
      return { id: null, name: null, error: 'Selected class belongs to a different school' };
    }
    return { id: cls.id, name: cls.name };
  }

  const names = Array.from(
    new Set(
      classNames
        .map((name) => cleanClassName(name) || name?.trim() || '')
        .filter(Boolean),
    ),
  ) as string[];
  if (!schoolId || names.length === 0) return { id: null, name: names[0] ?? null };

  const { data: cls } = await supabaseAdmin
    .from('classes')
    .select('id, name')
    .eq('school_id', schoolId)
    .in('name', names)
    .limit(1)
    .maybeSingle();

  if (cls) {
    return { id: cls.id, name: cls.name };
  }

  // Auto-create class since it doesn't exist yet
  const className = names[0];
  
  // Resolve an existing tutor/teacher for this school to assign
  let tutorId: string | null = null;

  // 1. Check if any class with this name (e.g. "Summer School 2026") already has a teacher globally
  const { data: globalClass } = await supabaseAdmin
    .from('classes')
    .select('teacher_id')
    .eq('name', className)
    .not('teacher_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (globalClass?.teacher_id) {
    tutorId = globalClass.teacher_id;
  }

  if (!tutorId) {
    const { data: ts } = await supabaseAdmin
      .from('teacher_schools')
      .select('teacher_id')
      .eq('school_id', schoolId)
      .limit(1)
      .maybeSingle();
    tutorId = (ts as any)?.teacher_id ?? null;
  }
  
  if (!tutorId) {
    const { data: t } = await supabaseAdmin
      .from('portal_users')
      .select('id')
      .eq('role', 'teacher')
      .eq('school_id', schoolId)
      .limit(1)
      .maybeSingle();
    tutorId = (t as any)?.id ?? null;
  }

  // Fallback: assign any existing tutor/teacher from the database
  if (!tutorId) {
    const { data: tGlobal } = await supabaseAdmin
      .from('portal_users')
      .select('id')
      .eq('role', 'teacher')
      .limit(1)
      .maybeSingle();
    tutorId = (tGlobal as any)?.id ?? null;
  }

  // Ensure teacher is linked to the school in teacher_schools (preventing unique constraint errors)
  if (tutorId && schoolId) {
    const { data: hasLink } = await supabaseAdmin
      .from('teacher_schools')
      .select('teacher_id')
      .eq('teacher_id', tutorId)
      .eq('school_id', schoolId)
      .maybeSingle();
    if (!hasLink) {
      await supabaseAdmin.from('teacher_schools').insert({
        teacher_id: tutorId,
        school_id: schoolId,
      });
    }
  }

  // classes.teacher_id is required. Do not create an ownerless class when no
  // teacher can be resolved; activation can continue without a class assignment.
  if (!tutorId) {
    console.error(`[resolveClassForStudent] Cannot create class "${className}": no teacher is available.`);
    return {
      id: null,
      name: className,
      error: 'No teacher is available to own the automatically created class',
    };
  }

  const { data: newCls, error: createErr } = await supabaseAdmin
    .from('classes')
    .insert({
      name: className,
      school_id: schoolId,
      teacher_id: tutorId,
      status: 'active',
      description: `Automatically created class for ${className}`,
    })
    .select('id, name')
    .single();

  if (createErr) {
    console.error(`[resolveClassForStudent] Auto-creation of class "${className}" failed:`, createErr.message);
    return { id: null, name: className };
  }

  return { id: newCls.id, name: newCls.name };
}

/** One branded credentials card (label + email + temp password). */
function credentialsCard(label: string, accent: string, email: string, password: string): string {
  return `
<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:#141618;border:1px solid #2a2d33;border-radius:8px;overflow:hidden;margin:0 0 16px;">
  <tr><td style="background:#1c1e22;border-bottom:1px solid #2a2d33;padding:10px 16px;">
    <p style="margin:0;font-size:10px;color:${accent};text-transform:uppercase;letter-spacing:1.5px;font-weight:800;">${label}</p>
  </td></tr>
  <tr><td style="padding:14px 16px;border-bottom:1px solid #2a2d33;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-size:12px;color:#71717a;font-weight:700;width:35%;">Username / Email</td>
      <td style="font-size:13px;color:#ffffff;font-weight:800;text-align:right;font-family:monospace,Arial;">${email.trim().toLowerCase()}</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:14px 16px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-size:12px;color:#71717a;font-weight:700;width:35%;">Temporary Password</td>
      <td style="font-size:13px;color:#f59e0b;font-weight:800;text-align:right;font-family:monospace,Arial;">${password}</td>
    </tr></table>
  </td></tr>
</table>`;
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

async function sendStudentCredentialsEmail(
  destinationEmail: string,
  loginEmail: string,
  fullName: string,
  password: string,
  schoolName: string | null,
  registrationResultId?: string,
  parentLogin?: { email: string; password: string } | null,
  portalUserId?: string,
  isSummerSchool?: boolean,
): Promise<boolean> {
  try {
    const { notificationsService } = await import('@/services/notifications.service');
    const { buildWelcomeEmail } = await import('@/lib/email/rillcod-transactional-email');

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com').replace(/\/$/, '');
    const loginUrl = `${appUrl}/login`;

    const html = buildWelcomeEmail({
      recipientName: parentLogin ? `${fullName}'s Parent/Guardian` : fullName,
      role: 'student',
      schoolName: schoolName ?? undefined,
      loginUrl,
      appUrl,
    });

    const parentBlock = parentLogin
      ? credentialsCard('Parent / Guardian Portal Login', '#10b981', parentLogin.email, parentLogin.password)
      : '';
    const studentBlock = credentialsCard('Student Portal Login', '#7c3aed', loginEmail, password);

    const intro = parentLogin
      ? `<p style="font-size:13px;color:#d4d4d8;margin:0 0 14px;">Below are the login details for <strong style="color:#fff;">${fullName}</strong>. The <strong>Parent Portal</strong> lets you track progress, reports and payments; the <strong>Student Portal</strong> is for your child's lessons and activities.</p>`
      : '';

    const credentialsBlock = `${intro}${parentBlock}${studentBlock}
<p style="font-size:12px;color:#71717a;margin:0 0 20px;">
  Please change ${parentLogin ? 'these passwords' : 'this password'} after first login in profile settings. Keep these credentials private.
</p>`;

    // Attach the receipt PDF when the student has a completed payment — reuse the
    // canonical receipt generator + the same attachments:[{filename,content:base64}]
    // shape used elsewhere, so one email carries credentials AND the receipt.
    let attachments: Array<{ filename: string; content: string }> | undefined;
    let receiptUrl = '';
    if (portalUserId) {
      try {
        const { data: tx } = await supabaseAdmin
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
        console.error('[sendStudentCredentialsEmail] receipt attachment failed:', receiptErr);
      }
    }

    let waGroupLink = '';
    if (isSummerSchool) {
      try {
        const { getSummerSchoolWhatsAppLink } = await import('@/lib/summer-school/whatsapp-group');
        waGroupLink = (await getSummerSchoolWhatsAppLink()) || '';
      } catch (waErr) {
        console.error('[sendStudentCredentialsEmail] Failed to resolve WhatsApp group link:', waErr);
      }
    }

    const whatsappBlock = waGroupLink
      ? `<div style="margin:0 0 16px;padding:14px 16px;background:#141618;border:1px solid #2a2d33;border-radius:8px;text-align:center;">
           <p style="margin:0 0 8px;font-size:11px;color:#25d366;text-transform:uppercase;letter-spacing:1.5px;font-weight:800;">Class WhatsApp Group</p>
           <p style="margin:0 0 10px;font-size:12px;color:#a1a1aa;">Join the cohort WhatsApp group to receive class links, daily updates, and schedules:</p>
           <a href="${waGroupLink}" style="display:inline-block;padding:9px 20px;background:#25d366;color:#fff;font-size:13px;font-weight:800;text-decoration:none;border-radius:8px;">Join WhatsApp Group →</a>
         </div>`
      : '';

    // Receipt link fallback — always available even if the PDF attach failed.
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
      subject: parentLogin
        ? `Your Rillcod Academy Parent & Student Login Details`
        : `Your Rillcod Academy Login Credentials`,
      html: finalHtml,
      fromName: 'Rillcod Technologies',
      fromEmail: SMTP_FROM_EMAIL,
      ...(attachments ? { attachments } : {}),
    });

    // Mark delivery as sent in registration_results
    if (registrationResultId) {
      await supabaseAdmin.from('registration_results')
        .update({ status: 'sent' })
        .eq('id', registrationResultId);
    }
    return true;
  } catch (err) {
    console.error('Failed to send student credentials email:', err);
    // Mark delivery as failed
    if (registrationResultId) {
      await supabaseAdmin.from('registration_results')
        .update({ status: 'failed' })
        .eq('id', registrationResultId);
    }
    return false;
  }
}

const bodySchema = z.object({
  studentId: z.string().uuid('Invalid student ID format'),
  classId: z.string().uuid().nullable().optional(),
  forceResend: z.boolean().optional(),
});

// Archive a parent's generated login into registration_results (the credentials vault),
// under a per-school "Single Student Parent Account" batch. Extracted so the two
// parent-activation paths (new parent / existing parent) share one implementation.
async function archiveParentCredential(
  admin: any,
  schoolId: string,
  schoolName: string | null,
  parentName: string,
  email: string,
  password: string,
): Promise<void> {
  try {
    const batchName = 'Single Student Parent Account';
    const { data: existingBatch } = await admin
      .from('registration_batches').select('id')
      .eq('school_id', schoolId).eq('class_name', batchName).maybeSingle();
    let batchId: string | undefined = existingBatch?.id;
    if (!batchId) {
      batchId = crypto.randomUUID();
      await admin.from('registration_batches').insert({
        id: batchId, school_id: schoolId, school_name: schoolName,
        class_name: batchName, student_count: 1,
      });
    }
    await admin.from('registration_results').insert({
      batch_id: batchId,
      full_name: parentName || 'Parent/Guardian',
      email,
      password,
      class_name: 'Parent Account',
      status: 'created',
    });
  } catch (archiveErr) {
    console.error('[ActivateParent] credential archive failed:', archiveErr);
  }
}

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
      .select('id, name, full_name, student_email, parent_email, parent_name, user_id, status, school_id, school_name, enrollment_type, current_class, section, grade_level, course_interest, registration_payment_at, registration_paystack_reference, created_by')
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

    if (student.enrollment_type === 'summer_school') {
      try {
        const { ensureSummerClassWithTutor } = await import('@/lib/summer-school/onboard');
        await ensureSummerClassWithTutor(supabaseAdmin, resolvedSchoolId, resolvedSchoolName || 'Online School');
      } catch (err) {
        console.error('[ActivateStudent] ensureSummerClassWithTutor failed:', err);
      }
    }

    const resolvedClass = await resolveClassForStudent(
      resolvedSchoolId,
      classId ?? studentClassId ?? null,
      [
        ...(student.enrollment_type === 'summer_school' ? ['Summer School 2026'] : []),
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
    // Specific canonical grade (Basic 2 / JSS 1 …) — kept separate from the class/section so it
    // sticks on the portal account instead of being re-derived from the class band.
    const specificGrade = cleanGrade(student.grade_level) || null;

    if (portalUserId) {
      // Reset password of the existing auth user
      const { error: resetErr } = await supabaseAdmin.auth.admin.updateUserById(portalUserId, {
        password: tempPassword,
        user_metadata: { full_name: student.full_name, role: 'student' },
      });

      if (resetErr) {
        return NextResponse.json({ error: `Failed to reset password: ${resetErr.message}` }, { status: 500 });
      }

      // Update portal_users profile
      const portalUpdate: Database['public']['Tables']['portal_users']['Update'] = {
        is_active: true,
        school_id: resolvedSchoolId,
        school_name: resolvedSchoolName,
        section_class: resolvedClassName,
        ...(specificGrade ? { grade: specificGrade } : {}),
        updated_at: new Date().toISOString(),
      };
      // Only set class_id when we actually resolved one — never wipe an existing
      // assignment (e.g. a summer student's "Summer School 2026" class) on resend.
      if (resolvedClassId) portalUpdate.class_id = resolvedClassId;
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
        user_metadata: { full_name: student.full_name, role: 'student' },
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
        enrollment_type: student.enrollment_type || 'in_person',
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
      enrollmentType: student.enrollment_type,
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
    try {
      let parentUserId: string | null = null;
      const { data: link } = await supabaseAdmin
        .from('parent_student_links')
        .select('parent_id')
        .eq('student_id', studentId)
        .maybeSingle();
      parentUserId = link?.parent_id ?? null;

      if (!parentUserId && originalParentEmail) {
        const { data: pu } = await supabaseAdmin
          .from('portal_users')
          .select('id')
          .eq('email', originalParentEmail.trim().toLowerCase())
          .eq('role', 'parent')
          .maybeSingle();
        parentUserId = pu?.id ?? null;
      }

      const normParentEmail = originalParentEmail?.trim().toLowerCase();

      // If we STILL don't have a parent portal user ID, but we have a parent email, create it!
      if (!parentUserId && normParentEmail) {
        // Look up by email in auth
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
        const existingAuthParent = list?.users?.find((u) => u.email?.trim().toLowerCase() === normParentEmail);
        
        let parentId = existingAuthParent?.id ?? null;
        const parentPw = generateTempPassword();
        
        if (!parentId) {
          // Create parent user in auth
          const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email: normParentEmail,
            password: parentPw,
            email_confirm: true,
            user_metadata: { full_name: student.parent_name || 'Parent/Guardian', role: 'parent' },
          });
          if (!createErr && created?.user) {
            parentId = created.user.id;
          } else {
            console.error('[ActivateParent] Auth user creation failed:', createErr?.message);
          }
        } else {
          // Reset password for the existing auth user
          await supabaseAdmin.auth.admin.updateUserById(parentId, { password: parentPw });
        }

        if (parentId) {
          // Upsert portal_users profile
          await supabaseAdmin.from('portal_users').upsert({
            id: parentId,
            email: normParentEmail,
            full_name: student.parent_name || 'Parent/Guardian',
            role: 'parent',
            school_id: resolvedSchoolId,
            school_name: resolvedSchoolName,
            is_active: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });

          parentUserId = parentId;
          parentLogin = { email: normParentEmail, password: parentPw };

          // Also archive parent credentials in registration_results!
          await archiveParentCredential(
            supabaseAdmin, resolvedSchoolId, resolvedSchoolName,
            student.parent_name || 'Parent/Guardian', normParentEmail, parentPw,
          );
        }
      } else if (parentUserId) {
        const { data: parentUser } = await supabaseAdmin
          .from('portal_users')
          .select('email, role')
          .eq('id', parentUserId)
          .maybeSingle();
        if (parentUser?.email && parentUser.role === 'parent') {
          const parentPw = generateTempPassword();
          const { error: resetErr } = await supabaseAdmin.auth.admin.updateUserById(parentUserId, { password: parentPw });
          if (!resetErr) {
            parentLogin = { email: parentUser.email.trim().toLowerCase(), password: parentPw };

            // Update/insert into registration_results for the parent too!
            await archiveParentCredential(
              supabaseAdmin, resolvedSchoolId, resolvedSchoolName,
              student.parent_name || 'Parent/Guardian', parentUser.email.trim().toLowerCase(), parentPw,
            );
          }
        }
      }

      if (parentUserId) {
        // Self-heal: guarantee the parent↔student link exists (idempotent upsert).
        try { await syncExplicitParentStudentLink(supabaseAdmin, parentUserId, studentId); } catch { /* non-fatal */ }
      }
    } catch (parentErr) {
      console.error('[ActivateStudent] Parent credential creation/resend failed:', parentErr);
    }

    await sendStudentCredentialsEmail(
      destinationEmail,
      loginEmail,
      student.full_name || student.name || 'Student',
      tempPassword,
      resolvedSchoolName,
      regResultId ?? undefined,
      parentLogin,
      portalUserId || student.user_id || undefined,
      student.enrollment_type === 'summer_school',
    );

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
