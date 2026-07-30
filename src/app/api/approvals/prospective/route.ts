import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { onboardSummerStudent, sendSpecialProgramActivation } from '@/lib/summer-school/onboard';
import { runClassAcademicReadiness } from '@/lib/academic/prepare-class-readiness';
import { isSpecialProgramProspect } from '@/lib/summer-school/balance-prospect';
import { processSuccessfulPayment } from '@/lib/payments/process-successful-payment';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Caller = { role: string; id: string; school_id: string | null };

async function getCaller(): Promise<Caller | null> {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users').select('role, id, school_id').eq('id', user.id).single();
  if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) return null;
  return caller as Caller;
}

// POST /api/approvals/prospective
// Body: { id: string; action: 'approved' | 'rejected' }
export async function POST(request: NextRequest) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

    const { id, action } = await request.json();
    if (!id || !['approved', 'rejected'].includes(action)) {
      return NextResponse.json({ error: 'id and valid action required' }, { status: 400 });
    }

    const admin = adminClient();

    const { data: record } = await admin
      .from('prospective_students')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!record) return NextResponse.json({ error: 'Prospective student not found' }, { status: 404 });

    if (caller.role !== 'admin') {
      if (!record.school_id) {
        return NextResponse.json({ error: 'Access denied: record has no school assignment' }, { status: 403 });
      }
      if (caller.role === 'teacher') {
        const { getTeacherSchoolIds } = await import('@/lib/auth-utils');
        const allowed = await getTeacherSchoolIds(caller.id, caller.school_id);
        if (!allowed.includes(record.school_id)) {
          return NextResponse.json(
            { error: 'Access denied: this record belongs to a different school' },
            { status: 403 },
          );
        }
      } else if (record.school_id !== caller.school_id) {
        return NextResponse.json(
          { error: 'Access denied: this record belongs to a different school' },
          { status: 403 },
        );
      }
    }

    if (action === 'rejected') {
      const { error } = await admin
        .from('prospective_students')
        .update({ is_deleted: true, is_active: false })
        .eq('id', id);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (record.status === 'unpaid') {
      return NextResponse.json(
        { error: 'Cannot approve: applicant has not completed online payment. Reject the record or ask them to finish checkout.' },
        { status: 400 },
      );
    }

    if (!record.parent_email && !record.email) {
      return NextResponse.json({ error: 'Applicant has no email to create an account' }, { status: 400 });
    }

    if (!isSpecialProgramProspect(record)) {
      return NextResponse.json(
        { error: 'This applicant is not a special programme prospect. Onboard them from Dashboard → Consent Forms instead.' },
        { status: 400 },
      );
    }

    const { data: pendingPayments, error: pendingLoadError } = await admin
      .from('payment_transactions')
      .select('id, transaction_reference, payment_method, payment_status')
      .contains('payment_gateway_response', { prospect_id: id })
      .in('payment_status', ['pending', 'processing', 'submitted']);
    if (pendingLoadError) {
      return NextResponse.json({ error: `Could not load applicant payments: ${pendingLoadError.message}` }, { status: 500 });
    }

    const { data: completedPayments } = await admin
      .from('payment_transactions')
      .select('id')
      .contains('payment_gateway_response', { prospect_id: id })
      .in('payment_status', ['completed', 'success', 'paid'])
      .limit(1);

    if (record.status === 'pending_verification' && !(pendingPayments?.length) && !(completedPayments?.length)) {
      return NextResponse.json(
        { error: 'No payment record found for this applicant. Ask them to resubmit registration with transfer reference or receipt upload.' },
        { status: 400 },
      );
    }

    let settledCount = 0;
    for (const payment of pendingPayments ?? []) {
      let paymentReference = payment.transaction_reference;
      if (!paymentReference) {
        paymentReference = `PROSPECT-APPR-${String(payment.id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}-${Date.now()}`;
        const { error: referenceError } = await admin
          .from('payment_transactions')
          .update({ transaction_reference: paymentReference, updated_at: new Date().toISOString() })
          .eq('id', payment.id)
          .in('payment_status', ['pending', 'processing', 'submitted']);
        if (referenceError) {
          return NextResponse.json({ error: `Could not prepare payment for settlement: ${referenceError.message}` }, { status: 500 });
        }
      }
      try {
        await processSuccessfulPayment(paymentReference, payment.payment_method || 'bank_transfer', {
          approved_by: caller.id,
          approved_at: new Date().toISOString(),
          source: 'prospective_approval',
        });
        settledCount += 1;
      } catch (settlementError: any) {
        return NextResponse.json(
          { error: `Applicant payment could not be settled: ${settlementError?.message || 'unknown finance error'}` },
          { status: 500 },
        );
      }
    }

    const { data: refreshed } = await admin
      .from('prospective_students')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (settledCount > 0 && refreshed?.is_active) {
      let activation = { email: false, whatsapp: false };
      try {
        const onboard = await onboardSummerStudent(admin, refreshed as any, { approvedBy: caller.id });
        activation = await sendSpecialProgramActivation(onboard, refreshed as any, { force: true });
        after(() => runClassAcademicReadiness(onboard.classId));
      } catch (activationErr) {
        console.error('Failed to send activation after prospective approval settlement:', activationErr);
      }
      return NextResponse.json({
        success: true,
        message: activation.email
          ? 'Payment verified and activation email sent to the parent.'
          : 'Payment verified and student onboarded. Check email delivery if the parent did not receive login details.',
        activation,
      });
    }

    // Fallback: payment already settled elsewhere or onboarding did not complete inside settlement.
    const onboard = await onboardSummerStudent(admin, record as any, { approvedBy: caller.id });

    await admin
      .from('prospective_students')
      .update({
        is_active: true,
        status: refreshed?.status === 'partially_paid' ? 'partially_paid' : 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    try {
      const { harnessProspectToContactBook } = await import('@/lib/crm/sync-prospect');
      await harnessProspectToContactBook(id, onboard.student.id);
    } catch (syncErr) {
      console.error('Failed to sync approved summer student to CRM contact book:', syncErr);
    }

    let activation = { email: false, whatsapp: false };
    try {
      activation = await sendSpecialProgramActivation(onboard, record as any, { force: true });
    } catch (mailErr) {
      console.error('Failed to send activation email on manual approval:', mailErr);
    }
    after(() => runClassAcademicReadiness(onboard.classId));

    return NextResponse.json({
      success: true,
      message: activation.email
        ? 'Applicant approved and activation email sent to the parent.'
        : 'Applicant approved. Portal accounts are ready — resend credentials from Approvals if email delivery failed.',
      activation,
      credentials: {
        parent: onboard.parent ? { email: onboard.parent.email, password: onboard.parent.password } : null,
        student: { email: onboard.student.email, password: onboard.student.password },
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
