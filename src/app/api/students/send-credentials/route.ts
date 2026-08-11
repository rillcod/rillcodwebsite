import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { deliverPortalCredentials } from '@/lib/credentials/deliver-portal-credentials';

export const dynamic = 'force-dynamic';

// POST /api/students/send-credentials
// Sends the student's (and parent's) EXISTING login to the parent by WhatsApp + email.
// It deliberately does NOT reset any password — the previously generated password still
// stands. Use the "Resend" action instead when you actually want to reset it.
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('portal_users').select('role, school_id').eq('id', user.id).single();
    if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json() as { studentId?: unknown };
    const studentId = typeof body.studentId === 'string' ? body.studentId.trim() : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(studentId)) {
      return NextResponse.json({ error: 'Select a valid student and try again.' }, { status: 400 });
    }

    const { data: row, error: rowError } = await admin
      .from('students')
      .select('id, full_name, student_email, parent_email, parent_phone, parent_name, user_id, school_id, school_name')
      .eq('id', studentId)
      .maybeSingle();
    if (rowError) throw rowError;
    if (!row) return NextResponse.json({ error: 'Student record was not found.' }, { status: 404 });

    const resolvedStudentUserId = row.user_id ?? null;

    // Campus scope for non-admin staff
    if (profile.role !== 'admin') {
      const { getTeacherSchoolIds } = await import('@/lib/auth-utils');
      const allowed =
        profile.role === 'teacher'
          ? await getTeacherSchoolIds(user.id, profile.school_id)
          : profile.school_id
            ? [profile.school_id]
            : [];
      let targetSchoolId = row.school_id ?? null;
      if (!targetSchoolId && resolvedStudentUserId) {
        const { data: stu } = await admin
          .from('portal_users')
          .select('school_id')
          .eq('id', resolvedStudentUserId)
          .maybeSingle();
        targetSchoolId = stu?.school_id ?? null;
      }
      if (!targetSchoolId || !allowed.includes(targetSchoolId)) {
        return NextResponse.json({ error: 'Student is outside your assigned school(s)' }, { status: 403 });
      }
    }

    if (!resolvedStudentUserId) {
      return NextResponse.json({ error: 'Activate the student account before sending credentials.' }, { status: 400 });
    }

    // Resolve the parent from the canonical link first. The mirrored email is a
    // compatibility fallback only; the client cannot choose recipients or passwords.
    const { data: canonicalLink } = await admin
      .from('parent_student_links')
      .select('parent_id')
      .eq('student_id', row.id)
      .maybeSingle();

    let parentAccount: { id: string; email: string | null; full_name: string | null } | null = null;
    if (canonicalLink?.parent_id) {
      const { data } = await admin
        .from('portal_users')
        .select('id, email, full_name')
        .eq('id', canonicalLink.parent_id)
        .eq('role', 'parent')
        .maybeSingle();
      parentAccount = data;
    }
    if (!parentAccount && row.parent_email) {
      const { data } = await admin
        .from('portal_users')
        .select('id, email, full_name')
        .eq('email', row.parent_email.trim().toLowerCase())
        .eq('role', 'parent')
        .maybeSingle();
      parentAccount = data;
    }

    const parentEmail = parentAccount?.email?.trim().toLowerCase() || null;
    if (!parentAccount?.id || !parentEmail) {
      return NextResponse.json({ error: 'Parent portal account could not be resolved.' }, { status: 400 });
    }

    const studentEmail = row.student_email?.trim().toLowerCase() || null;
    const credentialEmails = [studentEmail, parentEmail].filter((email): email is string => !!email);
    const { data: credentialRows, error: credentialError } = await admin
      .from('registration_results')
      .select('email, password, created_at')
      .in('email', credentialEmails)
      .not('password', 'is', null)
      .order('created_at', { ascending: false });
    if (credentialError) throw credentialError;

    const passwordByEmail = new Map<string, string>();
    for (const credential of credentialRows ?? []) {
      const email = credential.email?.trim().toLowerCase();
      if (email && credential.password && !passwordByEmail.has(email)) {
        passwordByEmail.set(email, credential.password);
      }
    }
    const studentPassword = studentEmail ? passwordByEmail.get(studentEmail) ?? null : null;
    const parentPassword = passwordByEmail.get(parentEmail) ?? null;
    if (!studentPassword && !parentPassword) {
      return NextResponse.json(
        { error: 'No reusable credentials are available. Use "Resend" to issue a fresh password.' },
        { status: 400 },
      );
    }

    const parentName = parentAccount.full_name || row.parent_name || `${row.full_name || 'Student'}'s parent/guardian`;
    const schoolName = row.school_name ?? null;
    const phone = row.parent_phone ?? null;

    const delivery = await deliverPortalCredentials(admin, {
      parent: {
        userId: parentAccount.id,
        email: parentEmail,
        displayName: parentName,
        role: 'parent',
        storedPassword: parentPassword ?? null,
      },
      students: studentEmail && resolvedStudentUserId
        ? [{
            userId: resolvedStudentUserId,
            email: studentEmail,
            displayName: row.full_name || 'Student',
            role: 'student',
            storedPassword: studentPassword ?? null,
          }]
        : [],
      parentPhone: phone,
      parentName,
      schoolName,
      resetPolicy: 'never',
      emailSubject: `Your Rillcod Login Details${schoolName ? ` — ${schoolName}` : ''}`,
      title: `Your Rillcod Login${schoolName ? ` — ${schoolName}` : ''}`,
      bodyIntro: `Hello ${parentName}, here are the Rillcod login details${schoolName ? ` for ${schoolName}` : ''}.`,
    });

    if (!delivery.email && !delivery.whatsapp) {
      return NextResponse.json(
        { error: 'Could not send by WhatsApp or email — check the parent phone/email on the student record.' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      whatsapp: delivery.whatsapp,
      email: delivery.email,
      hadPhone: !!phone,
    });
  } catch (err: unknown) {
    console.error('[students/send-credentials] error:', err);
    return NextResponse.json({ error: 'Credentials could not be sent. Please retry.' }, { status: 500 });
  }
}
