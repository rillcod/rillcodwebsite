import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { studentApprovalPaymentState } from '@/lib/registration/payment-state';
import { onboardPaidRegistrationStudent } from '@/lib/registration/onboard-paid-student';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type StaffCaller = { role: string; id: string; school_id: string | null };

async function callerCanAccessSchool(admin: ReturnType<typeof adminClient>, caller: StaffCaller, schoolId: string | null): Promise<boolean> {
  if (caller.role === 'admin') return true;
  if (!schoolId) return false;
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

async function requireStaff() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id, school_id')
    .eq('id', user.id)
    .single();
  if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) return null;
  return caller as StaffCaller;
}

// POST /api/approvals/students
// Body: { id: string; action: 'approved' | 'rejected' }
export async function POST(request: Request) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

  const { id, action } = await request.json();
  if (!id || !['approved', 'rejected'].includes(action)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const admin = adminClient();

  const { data: student, error: fetchErr } = await admin
    .from('students')
    .select('id, name, full_name, status, school_id, school_name, registration_payment_at, registration_paystack_reference, enrollment_type')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  if (!(await callerCanAccessSchool(admin, caller, student.school_id ?? null))) {
    return NextResponse.json(
      { error: 'Access denied: this student belongs to a different school' },
      { status: 403 },
    );
  }

  if (action === 'rejected') {
    const { logAudit } = await import('@/lib/audit/log');
    await admin.from('students').update({
      status: 'rejected',
      approved_by: caller.id,
      approved_at: null,
    }).eq('id', id);
    await logAudit(admin as any, {
      action: 'student.registration_rejected',
      actorId: caller.id,
      resourceType: 'students',
      resourceId: id,
      newValue: `Rejected registration for ${student.full_name || student.name || 'student'}${student.school_name ? ` at ${student.school_name}` : ''}`,
      oldValues: { status: student.status },
      newValues: {
        summary: `Rejected registration for ${student.full_name || student.name || 'student'}${student.school_name ? ` at ${student.school_name}` : ''}`,
        student_name: student.full_name || student.name || null,
        school_name: student.school_name || null,
        status: 'rejected',
      },
    });
    return NextResponse.json({ success: true });
  }

  if (studentApprovalPaymentState(student) === 'awaiting_payment') {
    return NextResponse.json(
      { error: 'Cannot approve: this public registration has no confirmed registration payment yet.' },
      { status: 400 },
    );
  }

  try {
    const result = await onboardPaidRegistrationStudent(admin as any, {
      studentId: id,
      actorId: caller.id,
      source: 'staff_approve',
    });
    return NextResponse.json({
      success: true,
      message: 'Student approved. Activation email sent to the parent when delivery succeeded.',
      credentials: result.password
        ? { email: result.loginEmail, password: result.password }
        : { email: result.loginEmail },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Approval failed' }, { status: 500 });
  }
}
