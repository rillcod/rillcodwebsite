import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/config/env';
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js';
import { validateEmail } from '@/lib/validation';
import { checkCustomRateLimit } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';
import { createPendingPayment } from '@/lib/payments/pending-transaction';
import { parseBankTransferReference } from '@/lib/summer-school/receipt-upload';
import { sendRegistrationPaymentEmail } from '@/lib/registration/payment-link-email';
import { notifySpecialProgramAdminOps } from '@/lib/summer-school/admin-ops-notify';
import { findStudentForTermBalancePayment } from '@/lib/registration/term-balance';
import {
  TERM_BALANCE_PATH,
  TERM_REGISTRATION_BALANCE_PAYMENT_TYPE,
} from '@/lib/registration/enrollment-types';
import {
  bankTransferProofMatches,
  buildTermBalanceGatewayMeta,
  resolveTermBalancePaymentCharge,
} from '@/lib/registration/term-registration-intake';

function adminClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** GET /api/payments/registration/balance?email=parent@example.com */
export async function GET(req: NextRequest) {
  const email = new URL(req.url).searchParams.get('email')?.trim().toLowerCase();
  if (!email || !validateEmail(email)) {
    return NextResponse.json({ error: 'Valid parent email is required' }, { status: 400 });
  }

  const match = await findStudentForTermBalancePayment(email);
  if (!match) {
    return NextResponse.json(
      {
        error:
          'No outstanding registration balance found for this email. Use the parent email from your registration form, or contact support.',
      },
      { status: 404 },
    );
  }

  const { student, amountPaid, totalTuition, balanceDue, balanceLabel, programName } = match;
  if (balanceDue <= 0) {
    return NextResponse.json({
      studentName: student.full_name || student.name || 'Student',
      status: 'paid',
      totalTuition,
      amountPaid,
      balanceDue: 0,
    });
  }

  return NextResponse.json({
    studentName: student.full_name || student.name || 'Student',
    status: 'partially_paid',
    totalTuition,
    amountPaid,
    balanceDue,
    balanceLabel,
    programName,
    enrollmentType: student.enrollment_type,
  });
}

/** POST /api/payments/registration/balance — Paystack or bank transfer for remaining term tuition */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const paymentMethod = String(body.payment_method || 'paystack').trim().toLowerCase();
    const paymentReference = body.payment_reference != null ? String(body.payment_reference) : undefined;
    const transferAmount = body.transfer_amount;

    if (!email || !validateEmail(email)) {
      return NextResponse.json({ error: 'Valid parent email is required' }, { status: 400 });
    }

    try {
      await checkCustomRateLimit({ key: `term-balance:${email}`, max: 5, window: 600 });
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json({ error: 'Too many attempts. Please wait and try again.' }, { status: 429 });
      }
      throw err;
    }

    const match = await findStudentForTermBalancePayment(email);
    if (!match) {
      return NextResponse.json(
        { error: 'No outstanding registration balance found for this email.' },
        { status: 404 },
      );
    }

    const { student, balanceDue, balanceLabel, totalTuition, amountPaid, programName } = match;
    if (balanceDue <= 0) {
      return NextResponse.json({ error: 'Registration balance is already fully paid — thank you!' }, { status: 400 });
    }

    const chargeResult = resolveTermBalancePaymentCharge({
      paymentMethod,
      outstandingBalance: balanceDue,
      totalTuition,
      amountPaidSoFar: amountPaid,
      transferAmount,
    });
    if (!chargeResult.ok) {
      return NextResponse.json({ error: chargeResult.error }, { status: 400 });
    }
    const { chargeAmount, balanceDue: balanceAfter } = chargeResult.charge;

    const gatewayMeta = buildTermBalanceGatewayMeta({
      studentId: student.id,
      studentName: student.full_name || student.name || 'Student',
      parentEmail: email,
      enrollmentType: String(student.enrollment_type || 'online'),
      programName,
      totalTuition,
      amountPaidSoFar: amountPaid,
      chargeAmount,
      balanceDue: balanceAfter,
    });

    const supabase = adminClient();

    if (paymentMethod === 'bank_transfer') {
      const parsedRef = parseBankTransferReference(paymentReference);
      if (!parsedRef.ok) {
        return NextResponse.json({ error: parsedRef.error }, { status: 400 });
      }

      const { data: recentPending } = await supabase
        .from('payment_transactions')
        .select('id, transaction_reference, payment_gateway_response, created_at, payment_status')
        .contains('payment_gateway_response', { student_id: student.id, balance_payment: true })
        .eq('payment_status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const recentMeta = (recentPending?.payment_gateway_response || {}) as Record<string, unknown>;
      const recentAgeMs = recentPending?.created_at
        ? Date.now() - new Date(recentPending.created_at).getTime()
        : Number.POSITIVE_INFINITY;
      const sameProof = bankTransferProofMatches(recentMeta, {
        receiptUrl: parsedRef.receiptUrl,
        transferReference: parsedRef.transferReference,
        chargeAmount,
      });
      if (recentPending && recentAgeMs < 5 * 60 * 1000 && sameProof) {
        return NextResponse.json({
          success: true,
          reference: recentPending.transaction_reference,
          paymentMethod: 'bank_transfer',
          message: 'Balance payment already submitted. Our team is verifying your transfer.',
          idempotent: true,
        });
      }

      const txReference = parsedRef.receiptUrl
        ? `RCPT-REG-BAL-${Date.now()}-${student.id.substring(0, 6)}`
        : parsedRef.transferReference!;

      const pending = await createPendingPayment(supabase as any, {
        amount: chargeAmount,
        currency: 'NGN',
        method: 'bank_transfer',
        reference: txReference,
        subject: { type: 'registration', id: student.id },
        metadata: {
          ...gatewayMeta,
          receipt_url: parsedRef.receiptUrl,
          transfer_reference: parsedRef.transferReference,
        },
      });
      if (!pending.ok) {
        return NextResponse.json(
          { error: pending.error.message },
          { status: pending.error.code === 'conflict' ? 409 : 500 },
        );
      }

      await notifySpecialProgramAdminOps({
        channel: 'term',
        studentName: student.full_name || student.name || 'Student',
        parentEmail: email,
        amount: chargeAmount,
        method: 'Bank transfer — term balance (pending verification)',
        reference: txReference,
        programmeTitle: programName || 'Term registration',
        enrollmentType: String(student.enrollment_type || ''),
        receiptUrl: parsedRef.receiptUrl,
        transferReference: parsedRef.transferReference,
        totalTuition,
        balanceDue: balanceAfter,
        context: 'balance',
      });

      await sendRegistrationPaymentEmail({
        supabase,
        subjectId: student.id,
        reference: txReference,
        parentEmail: email,
        studentName: student.full_name || student.name || 'Student',
        programmeTitle: programName || 'Term registration',
        amount: chargeAmount,
        totalTuition,
        balanceDue: balanceAfter,
        paymentMethod: 'bank_transfer',
        receiptUrl: parsedRef.receiptUrl,
        transferReference: parsedRef.transferReference,
        balancePageKind: 'term',
      });

      return NextResponse.json({
        success: true,
        reference: txReference,
        paymentMethod: 'bank_transfer',
        message: parsedRef.receiptUrl
          ? 'Balance payment submitted with receipt. Our team will verify your transfer shortly.'
          : 'Balance payment submitted. Our team will verify your bank transfer reference shortly.',
      });
    }

    if (!env.PAYSTACK_SECRET_KEY) {
      return NextResponse.json(
        { error: 'Online payment is temporarily unavailable. Please pay by bank transfer or contact support.' },
        { status: 503 },
      );
    }

    const reference = `REG-BAL-${Date.now()}-${student.id.substring(0, 6)}`;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com';

    const pending = await createPendingPayment(supabase as any, {
      amount: chargeAmount,
      currency: 'NGN',
      method: 'paystack',
      reference,
      subject: { type: 'registration', id: student.id },
      metadata: gatewayMeta,
    });
    if (!pending.ok) {
      return NextResponse.json(
        { error: pending.error.message },
        { status: pending.error.code === 'conflict' ? 409 : 500 },
      );
    }

    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: chargeAmount * 100,
        reference,
        callback_url: `${baseUrl}${TERM_BALANCE_PATH}?payment=success&reference=${encodeURIComponent(reference)}&email=${encodeURIComponent(email)}`,
        metadata: {
          student_id: student.id,
          student_name: student.full_name || student.name,
          payment_type: TERM_REGISTRATION_BALANCE_PAYMENT_TYPE,
        },
      }),
    });

    const paystackData = await paystackRes.json();
    if (!paystackData.status || !paystackData.data?.authorization_url) {
      await supabase
        .from('payment_transactions')
        .delete()
        .eq('transaction_reference', reference)
        .eq('payment_status', 'pending')
        .is('paid_at', null)
        .is('external_transaction_id', null);
      return NextResponse.json(
        { error: paystackData.message || 'Payment gateway did not respond. Please try again.' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      paymentUrl: paystackData.data.authorization_url,
      reference,
      balanceDue: chargeAmount,
      balanceLabel,
      totalTuition,
      amountPaid,
      balanceAfter,
    });
  } catch (err: unknown) {
    console.error('[registration/balance] error:', err);
    return NextResponse.json({ error: 'We could not start the balance payment. Please try again.' }, { status: 500 });
  }
}
