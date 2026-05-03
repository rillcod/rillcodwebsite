import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import crypto from 'crypto';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
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
  return caller as { role: string; id: string; school_id: string | null };
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
    .select('id, full_name, student_email, parent_email, school_id, school_name, date_of_birth, status, current_class, grade_level')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  // School boundary: non-admin may only approve students from their own school
  if (caller.role !== 'admin' && student.school_id && student.school_id !== caller.school_id) {
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
  // Pick the login email: prefer student email, fall back to parent email
  const loginEmail = student.student_email || student.parent_email;
  if (!loginEmail) {
    return NextResponse.json({ error: 'Student has no email to create an account with' }, { status: 400 });
  }

  // Generate a random 10-char password
  const password = crypto.randomBytes(8).toString('base64url').slice(0, 10);
  const normalizedEmail = loginEmail.trim().toLowerCase();

  // ── Resolve school — every student must belong to one ────────────────────
  let resolvedSchoolId: string | null = student.school_id || null;
  let resolvedSchoolName: string | null = student.school_name || null;

  if (!resolvedSchoolId) {
    const { data: onlineSchool } = await admin
      .from('schools')
      .select('id, name')
      .ilike('name', '%online%')
      .eq('status', 'approved')
      .limit(1)
      .maybeSingle();

    if (onlineSchool) {
      resolvedSchoolId = onlineSchool.id;
      resolvedSchoolName = onlineSchool.name;
    }
  }

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
      date_of_birth: student.date_of_birth || null,
      section_class: (student as any).current_class || (student as any).grade_level || null,
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

    // Link student row to the portal user
    await admin.from('students').update({
      user_id: existingPortal.id,
      status: 'approved',
      approved_by: caller.id,
      approved_at: new Date().toISOString(),
    }).eq('id', id);

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
    date_of_birth: student.date_of_birth || null,
    section_class: (student as any).current_class || (student as any).grade_level || null,
    is_active: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  if (portalErr) {
    return NextResponse.json({ error: `Portal account synchronization failed: ${portalErr.message}` }, { status: 500 });
  }

  // Link student row to the portal user
  await admin.from('students').update({
    user_id: authUserId,
    status: 'approved',
    approved_by: caller.id,
    approved_at: new Date().toISOString(),
  }).eq('id', id);

  return NextResponse.json({
    success: true,
    credentials: { email: loginEmail, password },
  });
}
