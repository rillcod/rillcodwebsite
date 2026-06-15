import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { generateTempPassword } from '@/lib/utils/password';
import { ensureStudentCardIssued } from '@/lib/cards/auto-issue';

const supabaseAdmin = createAdminClient(
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

async function sendStudentCredentialsEmail(email: string, fullName: string, password: string, schoolName: string | null) {
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
        <td style="font-size:13px;color:#ffffff;font-weight:800;text-align:right;font-family:monospace,Arial;">${email.trim().toLowerCase()}</td>
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

    const finalHtml = html.replace('</body>', `${credentialsBlock}</body>`);

    await notificationsService.sendExternalEmail({
      to: email.trim().toLowerCase(),
      subject: `Your Rillcod Academy Login Credentials`,
      html: finalHtml,
      fromName: 'Rillcod Technologies',
      fromEmail: 'support@rillcod.com',
    });
  } catch (err) {
    console.error('Failed to send student credentials email:', err);
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

    const body = await req.json();
    const { studentId, classId } = body;
    if (!studentId) {
      return NextResponse.json({ error: 'studentId is required' }, { status: 400 });
    }

    // Fetch the student record
    const { data: student, error: studErr } = await supabaseAdmin
      .from('students')
      .select('id, name, full_name, student_email, parent_email, user_id, status, school_id, school_name, enrollment_type, class_id, current_class, section_class, grade_level')
      .eq('id', studentId)
      .single();

    if (studErr || !student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // If already has a portal account, return their info
    if (student.user_id) {
      const { data: existing } = await supabaseAdmin
        .from('portal_users')
        .select('id, email')
        .eq('id', student.user_id)
        .single();
      let cardIssued = false;
      let cardId: string | null = null;
      try {
        const card = await ensureStudentCardIssued(supabaseAdmin as any, {
          holderId: student.user_id,
          schoolId: student.school_id ?? null,
          classId: (student as any).class_id ?? null,
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

    // A student must be assigned to a school before activation
    if (!student.school_id) {
      return NextResponse.json({
        error: 'This student has no school assigned. Assign them to a school before activating their account.',
      }, { status: 400 });
    }

    if (!(await callerCanAccessSchool(staff, student.school_id))) {
      return NextResponse.json({ error: 'Access denied: this student belongs to a different school' }, { status: 403 });
    }

    // Determine login email: prefer student_email, fall back to parent_email
    const loginEmail = student.student_email?.trim() || student.parent_email?.trim();
    if (!loginEmail) {
      return NextResponse.json({
        error: 'No email address on file for this student. Please add student_email or parent_email first.',
      }, { status: 400 });
    }

    // Check if this email already has a portal account
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

    const tempPassword = generateTempPassword();

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

    const portalUserId = authData.user.id;

    const resolvedClass = await resolveClassForStudent(
      student.school_id ?? null,
      classId ?? (student as any).class_id ?? null,
      [student.current_class, student.section_class, student.grade_level],
    );
    if (resolvedClass.error) {
      return NextResponse.json({ error: resolvedClass.error }, { status: 400 });
    }
    const resolvedClassId = resolvedClass.id;
    const resolvedClassName = resolvedClass.name;

    // Create portal_users profile
    const { error: profileErr } = await supabaseAdmin.from('portal_users').insert({
      id: portalUserId,
      email: loginEmail,
      full_name: student.full_name || student.name || '',
      role: 'student',
      is_active: true,
      school_id: student.school_id ?? null,
      school_name: student.school_name ?? null,
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

    // Link student record to portal user + ensure status is approved
    await supabaseAdmin.from('students').update({
      user_id: portalUserId,
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: user.id,
    }).eq('id', studentId);

    let cardIssued = false;
    let cardId: string | null = null;
    try {
      const card = await ensureStudentCardIssued(supabaseAdmin as any, {
        holderId: portalUserId,
        schoolId: student.school_id ?? null,
        actorId: user.id,
        classId: resolvedClassId,
        metadata: { source: 'student_activate', student_id: studentId },
      });
      cardIssued = card.created;
      cardId = card.id;
    } catch (cardErr) {
      console.error('[ActivateStudent] Card auto-issue failed:', cardErr);
    }

    // --- Bridge Gap: Log to Registration History (Vault) ---
    try {
      const singleBatchName = 'Single Student Registrations';
      // Check if a dedicated batch for single student registrations exists for this school and creator
      let { data: existingBatch } = await supabaseAdmin
        .from('registration_batches')
        .select('id, student_count')
        .eq('school_id', student.school_id)
        .eq('created_by', user.id)
        .eq('class_name', singleBatchName)
        .maybeSingle();

      let batchId = existingBatch?.id;

      if (!existingBatch) {
        batchId = crypto.randomUUID();
        await supabaseAdmin.from('registration_batches').insert({
          id: batchId,
          created_by: user.id,
          school_id: student.school_id,
          school_name: student.school_name,
          class_name: singleBatchName,
          student_count: 1,
        });
      } else {
        await supabaseAdmin
          .from('registration_batches')
          .update({ student_count: (existingBatch.student_count ?? 0) + 1 })
          .eq('id', batchId);
      }

      // Record this single registration inside the results history table
      await supabaseAdmin.from('registration_results').insert({
        batch_id: batchId,
        full_name: student.full_name || student.name || '',
        email: loginEmail,
        password: tempPassword,
        class_name: resolvedClassName || student.grade_level || student.current_class || null,
        status: 'created',
      });
    } catch (histErr) {
      console.error('[ActivateStudent] Failed to archive credentials in history:', histErr);
      // Non-blocking for the student activation process itself
    }

    void sendStudentCredentialsEmail(
      loginEmail,
      student.full_name || student.name || 'Student',
      tempPassword,
      student.school_name
    );

    return NextResponse.json({
      success: true,
      alreadyActivated: false,
      email: loginEmail,
      tempPassword,
      portalUserId,
      cardIssued,
      cardId,
      message: `Portal account created for ${student.full_name}. Share the credentials with the student.`,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
