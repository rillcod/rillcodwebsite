import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { generateTempPassword } from '@/lib/utils/password';

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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
    const { data: caller } = await supabase
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!caller || !['admin', 'teacher'].includes(caller.role)) {
      return NextResponse.json({ error: 'Admin or teacher access required' }, { status: 403 });
    }

    const { studentId } = await req.json();
    if (!studentId) {
      return NextResponse.json({ error: 'studentId is required' }, { status: 400 });
    }

    // Fetch the student record
    const { data: student, error: studErr } = await supabaseAdmin
      .from('students')
      .select('id, name, full_name, student_email, parent_email, user_id, status, school_id, enrollment_type')
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
      return NextResponse.json({
        success: true,
        alreadyActivated: true,
        email: existing?.email ?? null,
        portalUserId: student.user_id,
        message: 'Student already has a portal account.',
      });
    }

    // Determine login email: prefer student_email, fall back to parent_email
    const loginEmail = student.student_email?.trim() || student.parent_email?.trim();
    if (!loginEmail) {
      return NextResponse.json({
        error: 'No email address on file for this student. Please add student_email or parent_email first.',
      }, { status: 400 });
    }

    // Check if this email already has an auth account using email filter (avoids loading all users)
    const { data: existingUser } = await supabaseAdmin.auth.admin.getUserByEmail(loginEmail);
    if (existingUser?.user) {
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

    // Create portal_users profile
    const { error: profileErr } = await supabaseAdmin.from('portal_users').insert({
      id: portalUserId,
      email: loginEmail,
      full_name: student.full_name || student.name || '',
      role: 'student',
      is_active: true,
      school_id: student.school_id ?? null,
      enrollment_type: student.enrollment_type ?? null,
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

    return NextResponse.json({
      success: true,
      alreadyActivated: false,
      email: loginEmail,
      tempPassword,
      portalUserId,
      message: `Portal account created for ${student.full_name}. Share the credentials with the student.`,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Internal error' }, { status: 500 });
  }
}
