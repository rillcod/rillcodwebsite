/**
 * POST /api/summer-school/ensure-onboarded
 *
 * Called from the client-side payment success callback when Paystack redirects
 * back after a successful payment. The Paystack webhook handles onboarding
 * automatically, but webhooks can be delayed by seconds to minutes.
 *
 * This endpoint:
 *  1. Looks up the payment transaction by reference.
 *  2. Verifies it is completed (or marks it so via Paystack API check).
 *  3. If the prospect already has a portal account → returns idempotently.
 *  4. If not yet onboarded → runs the full onboarding (identical to the webhook flow):
 *       • Creates @rillcod.com auth account + portal_users row
 *       • Auto-assigns to Rillcod Online School
 *       • Creates / updates students row
 *       • Sends credentials + receipt email to parent
 *       • Archives credentials in registration_results
 *
 * Public endpoint (no auth) — safe because:
 *   • Reference must exist in payment_transactions with status = completed
 *   • Idempotent — running twice produces the same result
 *   • Rate-limited by IP (10 req / hour)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/config/env';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';
import { onboardSummerStudent, sendSpecialProgramActivation } from '@/lib/summer-school/onboard';
import { getSummerProspectStatusForPayment } from '@/lib/registration/payment-state';
import {
  isSpecialProgramBalancePaymentType,
  isSpecialProgramPaymentType,
} from '@/lib/registration/enrollment-types';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit by IP
    const ip = getClientIp(req);
    try {
      await checkCustomRateLimit({ key: `ss-ensure:${ip}`, max: 10, window: 3600 });
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
      }
      throw err;
    }

    const { reference } = await req.json();
    if (!reference || typeof reference !== 'string') {
      return NextResponse.json({ error: 'Payment reference required' }, { status: 400 });
    }

    const supabase = adminClient();

    // 1. Find the transaction
    const { data: tx } = await supabase
      .from('payment_transactions')
      .select('id, payment_status, payment_gateway_response, amount, currency, payment_method, transaction_reference, paid_at')
      .eq('transaction_reference', reference.trim())
      .maybeSingle();

    if (!tx) return NextResponse.json({ error: 'Unknown payment reference' }, { status: 404 });

    const gateway = (tx.payment_gateway_response ?? {}) as Record<string, unknown>;
    const paymentType = gateway.payment_type as string | undefined;
    if (!isSpecialProgramPaymentType(paymentType)) {
      return NextResponse.json({ error: 'Not a summer school payment' }, { status: 400 });
    }

    const prospectId = gateway.prospect_id as string | undefined;
    if (!prospectId) return NextResponse.json({ error: 'No prospect linked to this payment' }, { status: 400 });

    // 2. Verify with Paystack if not yet completed
    if (tx.payment_status !== 'completed') {
      if (!env.PAYSTACK_SECRET_KEY) {
        return NextResponse.json({ error: 'Payment gateway not configured' }, { status: 500 });
      }
      const paystackRes = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` } }
      );
      const paystackData = await paystackRes.json();
      const verified = paystackData.status === true && paystackData?.data?.status === 'success';
      if (!verified) {
        return NextResponse.json({ onboarded: false, reason: 'Payment not yet confirmed by gateway' });
      }
      // Run the FULL payment pipeline, not a bare status flip. Flipping the
      // status directly made the later webhook a no-op (idempotency guard),
      // permanently skipping invoice creation, receipts, and notifications.
      const { processSuccessfulPayment } = await import('@/lib/payments/process-successful-payment');
      await processSuccessfulPayment(reference.trim(), 'paystack', paystackData.data);
    }

    if (isSpecialProgramBalancePaymentType(paymentType)) {
      await supabase.from('prospective_students').update({
        status: 'paid',
        is_active: true,
        updated_at: new Date().toISOString(),
      }).eq('id', prospectId);

      return NextResponse.json({
        onboarded: false,
        balanceSettled: true,
        message: 'Summer School balance payment confirmed',
      });
    }

    // 3. Check if prospect already onboarded
    const { data: prospect } = await supabase
      .from('prospective_students')
      .select('id, full_name, email, parent_email, parent_name, parent_phone, notes, school_id, school_name, grade, age, gender, course_interest, preferred_schedule, status')
      .eq('id', prospectId)
      .maybeSingle();

    if (!prospect) return NextResponse.json({ error: 'Prospect record not found' }, { status: 404 });

    if (!prospect.parent_email && !prospect.email) {
      return NextResponse.json({ error: 'No email on file for this applicant' }, { status: 400 });
    }

    // Run shared onboarding — idempotent, so it's safe even if the webhook has
    // already processed this prospect. Creates/links parent + student accounts,
    // resolves the school, enrols into a learning path, and archives credentials.
    const onboard = await onboardSummerStudent(supabase, prospect as any);

    const nextStatus = getSummerProspectStatusForPayment({
      paymentPlan: gateway.payment_plan,
      balanceDue: gateway.balance_due,
    });

    // Mark prospect active and preserve installment balance state when applicable.
    await supabase.from('prospective_students').update({
      status: nextStatus,
      is_active: true,
      updated_at: new Date().toISOString(),
    }).eq('id', prospectId);

    // Sync student + parent into the CRM contact book (parity with the webhook /
    // manual-approval paths — previously missing on this fallback route).
    try {
      const { harnessProspectToContactBook } = await import('@/lib/crm/sync-prospect');
      await harnessProspectToContactBook(prospectId, onboard.student.id);
    } catch (syncErr) {
      console.error('[ensure-onboarded] CRM contact-book sync failed:', syncErr);
    }

    const activation = await sendSpecialProgramActivation(onboard, prospect as any);

    return NextResponse.json({
      onboarded: true,
      alreadyExisted: !onboard.student.created,
      status: nextStatus,
      message: activation.email
        ? 'Portal accounts ready and activation email sent'
        : 'Portal accounts ready — activation email may still be processing',
      activationEmailSent: activation.email,
      loginEmail: onboard.student.email,
      parentLogin: onboard.parent?.email ?? null,
    });
  } catch (err: any) {
    console.error('[ensure-onboarded]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
