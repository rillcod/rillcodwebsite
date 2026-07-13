import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { verifySummerBalancePayment } from '@/lib/payments/verified-payment';
import { createPendingPayment } from '@/lib/payments/pending-transaction';
import { processSuccessfulPayment } from '@/lib/payments/process-successful-payment';
import { SPECIAL_PAYMENT_TYPE } from '@/lib/registration/enrollment-types';

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

  if (prospect.status === 'partially_paid') {
    try {
      const result = await verifySummerBalancePayment({
        prospectId,
        amount,
        method,
        reference,
        evidenceUrl,
        actorId: user.id,
        note: `Recorded by ${profile.full_name ?? profile.role}`,
        source: 'summer_school_manual_balance',
      });
      return NextResponse.json({
        ok: true,
        ...result,
        message: 'Balance payment verified, receipt issued, and reminders stopped.',
      });
    } catch (e: any) {
      return NextResponse.json({ error: e.message || 'Balance verification failed' }, { status: e.statusCode || 500 });
    }
  }

  const pending = await createPendingPayment(sb as any, {
    amount,
    currency: 'NGN',
    method: method as any,
    reference,
    subject: { type: 'prospect', id: prospectId },
    metadata: {
      payment_type: SPECIAL_PAYMENT_TYPE,
      prospect_id: prospectId,
      student_name: prospect.full_name,
      parent_name: prospect.parent_name || null,
      parent_email: prospect.parent_email || prospect.email || null,
      preferred_mode: prospect.preferred_schedule || 'Online',
      payment_plan: 'full',
      total_tuition: amount,
      amount_charged: amount,
      balance_due: 0,
      manual: true,
      evidence_url: evidenceUrl,
      recorded_by: profile.full_name ?? profile.role,
      recorded_by_id: user.id,
      recorded_at: now,
    },
  });
  if (!pending.ok) {
    return NextResponse.json({ error: pending.error.message }, { status: pending.error.code === 'conflict' ? 409 : 500 });
  }

  try {
    await processSuccessfulPayment(reference, method, {
      manual: true,
      evidence_url: evidenceUrl,
      recorded_by: user.id,
      recorded_at: now,
      source: 'summer_school_manual_payment',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Payment record was created but settlement could not finish: ${error?.message || 'unknown error'}`, transaction_id: (pending.data as any).id },
      { status: 500 },
    );
  }

  const { data: settled, error: settledError } = await (sb as any).from('payment_transactions')
    .select('id, invoice_id, receipt_url, payment_status')
    .eq('id', (pending.data as any).id)
    .maybeSingle();
  if (settledError || !settled || settled.payment_status !== 'completed') {
    return NextResponse.json({ error: settledError?.message || 'Payment settlement did not reach its completed state' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    transactionId: settled.id,
    invoiceId: settled.invoice_id ?? null,
    receiptUrl: settled.receipt_url ?? null,
    message: 'Payment settled, receipt issued, and student onboarding completed.',
  });
}
