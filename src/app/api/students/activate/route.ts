import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { generateTempPassword } from '@/lib/utils/password';
import { ensureStudentCardIssued } from '@/lib/cards/auto-issue';
import { resolveOnlineSchool } from '@/lib/schools/resolve-online-school';
import { ensureDefaultEnrollment } from '@/lib/enrollments/ensure-default-enrollment';
import { generateUniqueStudentLoginEmail } from '@/lib/students/generate-login-email';
import { syncExplicitParentStudentLink } from '@/lib/parents/links';
import crypto from 'crypto';
import { Database as GenDatabase } from '@/types/supabase';

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

  const names = Array.from(new Set(classNames.map((name) => name?.trim()).filter(Boolean))) as string[];
  if (!schoolId || names.length === 0) return { id: null, name: names[0] ?? null };

  const { data: cls } = await supabaseAdmin
    .from('classes')
    .select('id, name')
    .eq('school_id', schoolId)
    .in('name', names)
    .limit(1)
    .maybeSingle();
  return { id: cls?.id ?? null, name: cls?.name ?? names[0] ?? null };
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

async function sendStudentCredentialsEmail(
  destinationEmail: string,
  loginEmail: string,
  fullName: string,
  password: string,
  schoolName: string | null,
  registrationResultId?: string,
  parentLogin?: { email: string; password: string } | null,
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

    const finalHtml = html.replace('</body>', `${credentialsBlock}</body>`);

    await notificationsService.sendExternalEmail({
      to: destinationEmail.trim().toLowerCase(),
      subject: parentLogin
        ? `Your Rillcod Academy Parent & Student Login Details`
        : `Your Rillcod Academy Login Credentials`,
      html: finalHtml,
      fromName: 'Rillcod Technologies',
      fromEmail: 'support@rillcod.com',
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
      .select('id, name, full_name, student_email, parent_email, user_id, status, school_id, school_name, enrollment_type, current_class, section, grade_level')
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
    let resolvedSchoolId: string | null = resolvedSchool.id;
    let resolvedSchoolName: string | null = resolvedSchool.name;

    if (!resolvedSchoolId) {
      return NextResponse.json({
        error: 'This student has no school assigned. Assign them to a school before activating their account.',
      }, { status: 400 });
    }

    if (!(await callerCanAccessSchool(staff, resolvedSchoolId))) {
      return NextResponse.json({ error: 'Access denied: this student belongs to a different school' }, { status: 403 });
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

    const resolvedClass = await resolveClassForStudent(
      resolvedSchoolId,
      classId ?? studentClassId ?? null,
      [student.current_class, student.section, student.grade_level],
    );
    if (resolvedClass.error) {
      return NextResponse.json({ error: resolvedClass.error }, { status: 400 });
    }
    const resolvedClassId = resolvedClass.id;
    const resolvedClassName = resolvedClass.name;

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
        created_at: new Date().toISOString(),
      });

      if (profileErr) {
        // Rollback auth user
        await supabaseAdmin.auth.admin.deleteUser(portalUserId);
        return NextResponse.json({ error: profileErr.message }, { status: 400 });
      }
    }

    // Link student record to portal user + ensure status is approved, update student_email, parent_email, school_id and school_name
    await supabaseAdmin.from('students').update({
      user_id: portalUserId,
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: user.id,
      student_email: loginEmail,
      parent_email: student.parent_email || originalStudentEmail || null,
      school_id: resolvedSchoolId,
      school_name: resolvedSchoolName,
    }).eq('id', studentId);

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
    });

    // --- Bridge Gap: Log to Registration History (Vault) ---
    let regResultId: string | null = null;
    try {
      const singleBatchName = 'Single Student Registrations';
      // Check if a dedicated batch for single student registrations exists for this school and creator
      let { data: existingBatch } = await supabaseAdmin
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
        class_name: resolvedClassName || student.grade_level || student.current_class || null,
        status: 'created',
      }).select('id').single();
      regResultId = insertedResult?.id ?? null;
    } catch (histErr) {
      console.error('[ActivateStudent] Failed to archive credentials in history:', histErr);
      // Non-blocking for the student activation process itself
    }

    // If this student has a linked PARENT portal account (summer-school flow),
    // reset and include the parent login too, so the registration email carries
    // BOTH the parent and student credentials. We reset because temp passwords
    // are never stored in plaintext.
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

      if (parentUserId) {
        const { data: parentUser } = await supabaseAdmin
          .from('portal_users')
          .select('email, role')
          .eq('id', parentUserId)
          .maybeSingle();
        if (parentUser?.email && parentUser.role === 'parent') {
          const parentPw = generateTempPassword();
          const { error: resetErr } = await supabaseAdmin.auth.admin.updateUserById(parentUserId, { password: parentPw });
          if (!resetErr) parentLogin = { email: parentUser.email, password: parentPw };
          // Self-heal: guarantee the parent↔student link exists (idempotent upsert).
          try { await syncExplicitParentStudentLink(supabaseAdmin, parentUserId, studentId); } catch { /* non-fatal */ }
        }
      }
    } catch (parentErr) {
      console.error('[ActivateStudent] Parent credential resend failed:', parentErr);
    }

    void sendStudentCredentialsEmail(
      destinationEmail,
      loginEmail,
      student.full_name || student.name || 'Student',
      tempPassword,
      resolvedSchoolName,
      regResultId ?? undefined,
      parentLogin,
    );

    return NextResponse.json({
      success: true,
      alreadyActivated: student.user_id ? true : false,
      email: loginEmail,
      tempPassword,
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
