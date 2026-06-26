import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { onboardSummerStudent, sendSummerCredentials } from '@/lib/summer-school/onboard';
import { getSummerProspectStatusForPayment } from '@/lib/registration/payment-state';

export const dynamic = 'force-dynamic';
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

// POST /api/summer-school/manual-payment
// Staff records a PHYSICAL/offline payment (with uploaded evidence) for an unpaid
// summer applicant, which confirms it and admits the student in one step — the
// path that was previously blocked ("applicant has not completed online payment").
export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('portal_users').select('id, role, full_name').eq('id', user.id).single();
  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const prospectId = (body.prospectId as string) || '';
  const amount = Number(body.amount);
  const method = (body.method as string) || 'cash';
  const reference = (body.reference as string)?.trim() || `MANUAL-${Date.now()}`;
  const evidenceUrl = (body.evidenceUrl as string) || null;

  if (!prospectId) return NextResponse.json({ error: 'prospectId is required' }, { status: 400 });
  if (!evidenceUrl) return NextResponse.json({ error: 'Payment evidence is required — upload the receipt first.' }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Enter a valid payment amount.' }, { status: 400 });

  const sb = admin();
  const { data: prospect } = await (sb as any).from('prospective_students').select('*').eq('id', prospectId).maybeSingle();
  if (!prospect) return NextResponse.json({ error: 'Applicant not found' }, { status: 404 });
  if (!prospect.parent_email && !prospect.email) {
    return NextResponse.json({ error: 'Applicant has no email on file' }, { status: 400 });
  }

  const now = new Date().toISOString();

  // 1. Record the offline payment as a COMPLETED transaction, with the evidence.
  await (sb as any).from('payment_transactions').insert({
    portal_user_id: null, school_id: null, course_id: null,
    amount, currency: 'NGN',
    payment_method: method,
    payment_status: 'completed',
    transaction_reference: reference,
    paid_at: now,
    payment_gateway_response: {
      prospect_id: prospectId, manual: true, evidence_url: evidenceUrl,
      recorded_by: profile.full_name ?? profile.role, recorded_at: now,
      student_name: prospect.full_name, parent_email: prospect.parent_email,
    },
    created_at: now,
  });

  // 2. Mark the applicant paid so onboarding/finance treat it as confirmed.
  await (sb as any).from('prospective_students')
    .update({ status: 'paid', updated_at: now }).eq('id', prospectId);

  // 3. Onboard — parent + student accounts, school, class, link, enrolment, archive.
  let onboard;
  try {
    onboard = await onboardSummerStudent(sb as any, prospect as any, { approvedBy: user.id });
  } catch (e: any) {
    return NextResponse.json({ error: `Payment recorded, but onboarding failed: ${e.message}` }, { status: 500 });
  }

  // 4. Activate the applicant.
  await (sb as any).from('prospective_students').update({
    is_active: true,
    status: getSummerProspectStatusForPayment({ paymentPlan: 'full', balanceDue: 0 }),
    updated_at: now,
  }).eq('id', prospectId);

  // 5. CRM sync + credentials (only when an account was freshly created).
  try {
    const { harnessProspectToContactBook } = await import('@/lib/crm/sync-prospect');
    await harnessProspectToContactBook(prospectId, onboard.student.id);
  } catch { /* non-fatal */ }
  if (onboard.student.created || onboard.parent?.created) {
    try { await sendSummerCredentials(onboard, prospect as any); } catch { /* non-fatal */ }
  }

  return NextResponse.json({
    ok: true,
    alreadyExisted: !onboard.student.created,
    studentLogin: onboard.student.email,
    studentPassword: onboard.student.password,
    parentLogin: onboard.parent?.email ?? null,
    parentPassword: onboard.parent?.password ?? null,
    message: 'Payment recorded and student admitted.',
  });
}
