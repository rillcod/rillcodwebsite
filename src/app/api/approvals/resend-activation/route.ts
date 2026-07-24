import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { sendTermRegistrationActivation } from '@/lib/registration/term-activation';
import { sendSchoolPartnershipActivation } from '@/lib/registration/school-activation';
import { sendSpecialProgramActivation, onboardSummerStudent } from '@/lib/summer-school/onboard';

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
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id')
    .eq('id', user.id)
    .single();
  if (!caller || !['admin', 'teacher'].includes(caller.role)) return null;
  return caller;
}

/** POST /api/approvals/resend-activation — staff resend portal activation emails */
export async function POST(request: Request) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const type = String(body.type || '').trim().toLowerCase();
  const id = String(body.id || '').trim();
  if (!id || !['student', 'school', 'prospect'].includes(type)) {
    return NextResponse.json({ error: 'Invalid payload — type must be student, school, or prospect' }, { status: 400 });
  }

  const admin = adminClient();

  if (type === 'student') {
    const { data: student } = await admin
      .from('students')
      .select('id, full_name, name, student_email, parent_email, parent_name, parent_phone, user_id, school_id, school_name, enrollment_type, status')
      .eq('id', id)
      .maybeSingle();
    if (!student?.user_id) {
      return NextResponse.json({ error: 'Student has no portal account yet — approve first.' }, { status: 400 });
    }
    const activation = await sendTermRegistrationActivation(admin, student, { force: true });
    return NextResponse.json({
      success: true,
      delivered: activation.email,
      message: activation.email
        ? 'Activation email resent to the parent/guardian.'
        : 'Activation email could not be delivered — check parent email on file.',
    });
  }

  if (type === 'school') {
    const { data: school } = await admin
      .from('schools')
      .select('id, name, email, contact_person, status')
      .eq('id', id)
      .maybeSingle();
    if (!school?.email) {
      return NextResponse.json({ error: 'School has no email on record.' }, { status: 400 });
    }
    const normalizedEmail = school.email.trim().toLowerCase();
    const { data: portalUser } = await admin
      .from('portal_users')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();
    if (!portalUser?.id) {
      return NextResponse.json({ error: 'School portal account not found — approve the application first.' }, { status: 400 });
    }
    const activation = await sendSchoolPartnershipActivation(admin, {
      schoolId: school.id,
      schoolName: school.name,
      contactName: school.contact_person || school.name,
      email: school.email,
      portalUserId: portalUser.id,
      tempPassword: '',
      force: true,
    });
    return NextResponse.json({
      success: true,
      delivered: activation.email,
      message: activation.email
        ? 'School portal activation email resent.'
        : 'Activation email could not be delivered.',
    });
  }

  const { data: prospect } = await admin
    .from('prospective_students')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!prospect) {
    return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
  }
  try {
    const onboard = await onboardSummerStudent(admin, prospect as any, { approvedBy: caller.id });
    const activation = await sendSpecialProgramActivation(onboard, prospect as any, { force: true });
    return NextResponse.json({
      success: true,
      delivered: activation.email,
      message: activation.email
        ? 'Special programme activation email resent.'
        : 'Activation email could not be delivered.',
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not resend special programme activation' },
      { status: 500 },
    );
  }
}
