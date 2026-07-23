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
      .from('portal_users').select('role').eq('id', user.id).single();
    if (!profile || !['admin', 'teacher', 'school'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const {
      studentEmail,
      studentPassword,
      parentEmail,
      parentPassword,
      fullName,
      schoolName,
      studentUserId,
      parentUserId,
    } = await req.json();

    if (!studentPassword && !parentPassword) {
      return NextResponse.json(
        { error: 'No stored password to send. Use "Resend" to set a fresh one first.' },
        { status: 400 },
      );
    }

    type StudentContactRow = {
      parent_phone?: string | null;
      parent_name?: string | null;
      user_id?: string | null;
    };
    let phone: string | null = null;
    let parentName: string = fullName ? `${fullName}'s parent/guardian` : 'Parent/Guardian';
    let row: StudentContactRow | null = null;
    if (studentEmail) {
      const { data } = await admin.from('students')
        .select('parent_phone, parent_name, user_id').eq('student_email', studentEmail).limit(1).maybeSingle();
      row = (data as StudentContactRow | null) ?? null;
    }
    if (!row && parentEmail) {
      const { data } = await admin.from('students')
        .select('parent_phone, parent_name, user_id').eq('parent_email', parentEmail).limit(1).maybeSingle();
      row = (data as StudentContactRow | null) ?? null;
    }
    if (row) {
      phone = row.parent_phone ?? null;
      if (row.parent_name) parentName = row.parent_name;
    }

    let resolvedParentUserId = parentUserId as string | undefined;
    if (!resolvedParentUserId && parentEmail) {
      const { data: pu } = await admin.from('portal_users')
        .select('id').eq('email', parentEmail.trim().toLowerCase()).eq('role', 'parent').maybeSingle();
      resolvedParentUserId = pu?.id;
    }
    let resolvedStudentUserId = studentUserId as string | undefined;
    if (!resolvedStudentUserId && row?.user_id) resolvedStudentUserId = row.user_id;

    if (!resolvedParentUserId || !parentEmail) {
      return NextResponse.json({ error: 'Parent portal account could not be resolved.' }, { status: 400 });
    }

    const delivery = await deliverPortalCredentials(admin, {
      parent: {
        userId: resolvedParentUserId,
        email: parentEmail,
        displayName: parentName,
        role: 'parent',
        storedPassword: parentPassword ?? null,
      },
      students: studentEmail && resolvedStudentUserId
        ? [{
            userId: resolvedStudentUserId,
            email: studentEmail,
            displayName: fullName || 'Student',
            role: 'student',
            storedPassword: studentPassword ?? null,
          }]
        : [],
      parentPhone: phone,
      parentName,
      schoolName: schoolName ?? null,
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
    const message = err instanceof Error ? err.message : 'Failed to send credentials';
    console.error('[students/send-credentials] error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
