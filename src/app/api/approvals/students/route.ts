import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { resolveOnlineSchool } from '@/lib/schools/resolve-online-school';
import { ensureDefaultEnrollment } from '@/lib/enrollments/ensure-default-enrollment';
import { generateUniqueStudentLoginEmail } from '@/lib/students/generate-login-email';
import crypto from 'crypto';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type StaffCaller = { role: string; id: string; school_id: string | null };

async function callerCanAccessSchool(admin: ReturnType<typeof adminClient>, caller: StaffCaller, schoolId: string | null): Promise<boolean> {
  if (caller.role === 'admin') return true;
  if (!schoolId) return true;
  if (caller.school_id === schoolId) return true;
  if (caller.role !== 'teacher') return false;

  const { data } = await admin
    .from('teacher_schools')
    .select('school_id')
    .eq('teacher_id', caller.id)
    .eq('school_id', schoolId)
    .maybeSingle();
  return !!data;
}

async function resolveStudentClassId(
  admin: ReturnType<typeof adminClient>,
  schoolId: string | null,
  classNames: Array<string | null | undefined>,
): Promise<string | null> {
  const names = Array.from(new Set(classNames.map((name) => name?.trim()).filter(Boolean))) as string[];
  if (!schoolId || names.length === 0) return null;

  const { data } = await admin
    .from('classes')
    .select('id')
    .eq('school_id', schoolId)
    .in('name', names)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function requireStaff() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  // Use adminClient to bypass RLS on portal_users
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id, school_id')
    .eq('id', user.id)
    .single();
  if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) return null;
  return caller as StaffCaller;
}

async function sendStudentCredentialsEmail(
  destinationEmail: string,
  loginEmail: string,
  fullName: string,
  password: string,
  schoolName: string | null,
  portalUserId?: string,
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
        const admin = adminClient();
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
        console.error('[sendStudentCredentialsEmail] receipt attachment failed:', receiptErr);
      }
    }

    const receiptBlock = receiptUrl
      ? `<div style="margin:0 0 16px;padding:14px 16px;background:#141618;border:1px solid #2a2d33;border-radius:8px;text-align:center;">
           <p style="margin:0 0 8px;font-size:11px;color:#10b981;text-transform:uppercase;letter-spacing:1px;font-weight:800;">Payment Receipt</p>
           <p style="margin:0 0 10px;font-size:12px;color:#a1a1aa;">${attachments ? 'Your receipt is attached as a PDF.' : 'Your payment receipt is ready.'} View or download any time:</p>
           <a href="${receiptUrl}" style="display:inline-block;padding:9px 20px;background:#10b981;color:#fff;font-size:13px;font-weight:800;text-decoration:none;border-radius:8px;">View / Download Receipt →</a>
         </div>`
      : '';

    const finalHtml = html.replace('</body>', `${credentialsBlock}${receiptBlock}</body>`);

    await notificationsService.sendExternalEmail({
      to: destinationEmail.trim().toLowerCase(),
      subject: `Your Rillcod Academy Login Credentials`,
      html: finalHtml,
      fromName: 'Rillcod Technologies',
      fromEmail: 'support@rillcod.com',
      ...(attachments ? { attachments } : {}),
    });
  } catch (err) {
    console.error('Failed to send student credentials email:', err);
  }
}

async function findCompletedTransactionForStudent(
  admin: ReturnType<typeof adminClient>,
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

// POST /api/approvals/students
// Body: { id: string; action: 'approved' | 'rejected' }
// On approval: creates auth account + portal_users row so the student can log in.
export async function POST(request: Request) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

  const { id, action } = await request.json();
  if (!id || !['approved', 'rejected'].includes(action)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const admin = adminClient();

  // Fetch only needed fields — avoid select('*') for security hygiene
  const { data: student, error: fetchErr } = await admin
    .from('students')
    .select('id, name, full_name, student_email, parent_email, parent_name, user_id, status, school_id, school_name, enrollment_type, current_class, section, grade_level, registration_paystack_reference, date_of_birth')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  // School boundary: non-admin may only approve students from their assigned school(s)
  if (!(await callerCanAccessSchool(admin, caller, student.school_id ?? null))) {
    return NextResponse.json(
      { error: 'Access denied: this student belongs to a different school' },
      { status: 403 },
    );
  }

  if (action === 'rejected') {
    await admin.from('students').update({
      status: 'rejected',
      approved_by: caller.id,
      approved_at: null,
    }).eq('id', id);
    return NextResponse.json({ success: true });
  }

  // ── Approval path ────────────────────────────────────────────
  const originalStudentEmail = student.student_email?.trim();
  const originalParentEmail = student.parent_email?.trim();

  // Pick the contact email to receive credentials
  const destinationEmail = originalParentEmail || originalStudentEmail;
  if (!destinationEmail) {
    return NextResponse.json({ error: 'Student has no email address on file' }, { status: 400 });
  }

  // Generate login email in the canonical mike123@rillcod.com style. Reuse the
  // student's existing @rillcod.com login if one was already issued (idempotent).
  let loginEmail = '';
  if (originalStudentEmail && originalStudentEmail.toLowerCase().endsWith('@rillcod.com')) {
    loginEmail = originalStudentEmail;
  } else {
    loginEmail = await generateUniqueStudentLoginEmail(admin, student.full_name || student.name || '');
  }

  // Generate a random 10-char password
  const password = crypto.randomBytes(8).toString('base64url').slice(0, 10);
  const normalizedEmail = loginEmail.trim().toLowerCase();

  // ── Resolve school — every student must belong to one (shared resolver) ───
  const resolvedSchool = await resolveOnlineSchool(admin, {
    id: student.school_id,
    name: student.school_name,
  });
  const resolvedSchoolId: string | null = resolvedSchool.id;
  const resolvedSchoolName: string | null = resolvedSchool.name;

  const resolvedClassName = student.current_class || student.grade_level || null;
  const resolvedClassId = await resolveStudentClassId(admin, resolvedSchoolId, [
    student.current_class,
    student.grade_level,
  ]);

  // ── Step 1: Check portal_users by email FIRST ────────────────────────────
  const { data: existingPortal } = await admin
    .from('portal_users')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (existingPortal) {
    // Update existing portal user
    const { error: updateErr } = await admin.from('portal_users').update({
      role: 'student',
      full_name: student.full_name,
      school_name: resolvedSchoolName,
      school_id: resolvedSchoolId,
      class_id: resolvedClassId,
      date_of_birth: student.date_of_birth || null,
      section_class: resolvedClassName,
      is_active: true,
      updated_at: new Date().toISOString(),
    }).eq('id', existingPortal.id);

    if (updateErr) {
      return NextResponse.json({ error: `Failed to link portal account: ${updateErr.message}` }, { status: 500 });
    }

    // Update auth user with new password & metadata
    await admin.auth.admin.updateUserById(existingPortal.id, {
      password,
      user_metadata: { full_name: student.full_name, role: 'student' },
    });

    // Link student row to the portal user and update student_email + parent_email
    await admin.from('students').update({
      user_id: existingPortal.id,
      status: 'approved',
      approved_by: caller.id,
      approved_at: new Date().toISOString(),
      student_email: loginEmail,
      parent_email: student.parent_email || originalStudentEmail || null,
    }).eq('id', id);

    // Resolve and link any completed payment transactions to this portal user
    try {
      const tx = await findCompletedTransactionForStudent(admin, id, student, existingPortal.id);
      if (tx) {
        await admin
          .from('payment_transactions')
          .update({ portal_user_id: existingPortal.id })
          .eq('id', tx.id);
      }
    } catch (txErr) {
      console.error('[ApproveStudent] Failed to link payment transaction:', txErr);
    }

    void ensureDefaultEnrollment(admin, existingPortal.id, {
      grade: resolvedClassName,
      enrollmentType: student.enrollment_type,
    });
    void sendStudentCredentialsEmail(destinationEmail, loginEmail, student.full_name || student.name || 'Student', password, resolvedSchoolName, existingPortal.id);

    return NextResponse.json({
      success: true,
      credentials: { email: loginEmail, password },
    });
  }

  // ── Step 2: Create new auth account & portal user ────────────────────────
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
  let usedExistingAuth = false;

  if (authErr) {
    if (!authErr.message.includes('already been registered') && !authErr.message.includes('already exists')) {
      return NextResponse.json({ error: `Auth creation failed: ${authErr.message}` }, { status: 500 });
    }
    const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = listData?.users?.find(
      u => u.email?.trim().toLowerCase() === normalizedEmail
    );
    if (existing) {
      authUserId = existing.id;
      usedExistingAuth = true;
      // also update their password
      await admin.auth.admin.updateUserById(authUserId, {
        password,
        user_metadata: { full_name: student.full_name, role: 'student' },
      });
    }
  } else {
    authUserId = authData?.user?.id ?? null;
  }

  if (!authUserId) {
    return NextResponse.json({ error: 'Could not resolve auth user ID' }, { status: 500 });
  }

  // Use upsert to create/fix the portal_users row
  const { error: portalErr } = await admin.from('portal_users').upsert({
    id: authUserId,
    email: normalizedEmail,
    full_name: student.full_name,
    role: 'student',
    school_name: resolvedSchoolName,
    school_id: resolvedSchoolId,
    class_id: resolvedClassId,
    date_of_birth: student.date_of_birth || null,
    section_class: resolvedClassName,
    is_active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  if (portalErr) {
    return NextResponse.json({ error: `Portal account synchronization failed: ${portalErr.message}` }, { status: 500 });
  }

  // Link student row to the portal user and update student_email + parent_email
  await admin.from('students').update({
    user_id: authUserId,
    status: 'approved',
    approved_by: caller.id,
    approved_at: new Date().toISOString(),
    student_email: loginEmail,
    parent_email: student.parent_email || originalStudentEmail || null,
  }).eq('id', id);

  // Resolve and link any completed payment transactions to this portal user
  try {
    const tx = await findCompletedTransactionForStudent(admin, id, student, authUserId);
    if (tx) {
      await admin
        .from('payment_transactions')
        .update({ portal_user_id: authUserId })
        .eq('id', tx.id);
    }
  } catch (txErr) {
    console.error('[ApproveStudent] Failed to link payment transaction:', txErr);
  }

  void ensureDefaultEnrollment(admin, authUserId, {
    grade: resolvedClassName,
    enrollmentType: student.enrollment_type,
  });
  void sendStudentCredentialsEmail(destinationEmail, loginEmail, student.full_name || student.name || 'Student', password, resolvedSchoolName, authUserId);

  return NextResponse.json({
    success: true,
    credentials: { email: loginEmail, password },
  });
}
