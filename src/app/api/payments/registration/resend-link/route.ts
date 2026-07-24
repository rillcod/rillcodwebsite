import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { RateLimitError } from '@/lib/errors';
import { checkCustomRateLimit } from '@/proxies/rateLimit.proxy';
import { isSpecialProgramPaymentType } from '@/lib/registration/enrollment-types';
import { sendRegistrationPaymentEmail } from '@/lib/registration/payment-link-email';
import { sendNativeEnrolmentAcknowledgement } from '@/lib/registration/native-enrolment-email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const COMPLETED = new Set(['completed', 'success', 'paid']);

export async function POST(request: Request) {
  let body: { reference?: unknown; email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Reference and email are required.' }, { status: 400 });
  }

  const reference = String(body.reference || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  if (!reference || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Enter the registration reference and a valid email.' }, { status: 400 });
  }

  try {
    await checkCustomRateLimit({
      key: 'registration-email-resend:' + email,
      max: 3,
      window: 300,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Too many resend attempts. Please wait a few minutes and try again.' },
        { status: 429 },
      );
    }
  }

  const supabase = createAdminClient();
  const { data: transaction, error: lookupError } = await supabase
    .from('payment_transactions')
    .select('id, amount, payment_status, payment_gateway_response, transaction_reference')
    .eq('transaction_reference', reference)
    .maybeSingle();

  if (lookupError) {
    console.error('[registration-email-resend] lookup failed:', lookupError);
    return NextResponse.json({ error: 'Unable to check this registration right now.' }, { status: 500 });
  }
  if (!transaction) {
    return NextResponse.json({ error: 'Registration reference or email was not recognised.' }, { status: 404 });
  }

  const metadata = (
    transaction.payment_gateway_response &&
    typeof transaction.payment_gateway_response === 'object' &&
    !Array.isArray(transaction.payment_gateway_response)
      ? transaction.payment_gateway_response
      : {}
  ) as Record<string, unknown>;

  const paymentType = String(metadata.payment_type || '');
  const allowedType = paymentType === 'registration' || isSpecialProgramPaymentType(paymentType);
  const registeredEmail = String(metadata.parent_email || '').trim().toLowerCase();
  if (!allowedType || registeredEmail !== email) {
    return NextResponse.json({ error: 'Registration reference or email was not recognised.' }, { status: 404 });
  }

  if (COMPLETED.has(String(transaction.payment_status || '').toLowerCase())) {
    return NextResponse.json(
      { error: 'This payment is already complete. Check your inbox for the receipt or contact support.' },
      { status: 409 },
    );
  }

  const isAppEnrolment = metadata.is_app_enrolment === true || String(metadata.is_app_enrolment) === 'true';

  if (isAppEnrolment) {
    const subjectId = String(metadata.student_id || metadata.prospect_id || transaction.id);
    const delivery = await sendNativeEnrolmentAcknowledgement({
      supabase,
      subjectId,
      reference,
      parentEmail: email,
      parentName: String(metadata.parent_name || 'Parent / Guardian'),
      studentName: String(metadata.student_name || 'Learner'),
      programmeTitle: String(
        metadata.program_title || metadata.program_name || metadata.enrollment_type || 'Rillcod programme',
      ),
    });

    if (!delivery.delivered) {
      return NextResponse.json(
        {
          error: delivery.error || 'The enrolment email could not be sent. Contact support with your reference.',
          reference,
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      success: true,
      delivered: true,
      reference,
      message: 'Enrolment request confirmation was sent again. Check Inbox, Promotions and Spam.',
    });
  }

  const paymentUrl = String(metadata.authorization_url || '').trim();
  if (!paymentUrl) {
    return NextResponse.json(
      { error: 'This older registration has no reusable payment link. Please start the payment step again.' },
      { status: 409 },
    );
  }

  const subjectId = String(metadata.student_id || metadata.prospect_id || transaction.id);
  const isTerm = Boolean(metadata.student_id);
  const delivery = await sendRegistrationPaymentEmail({
    supabase,
    subjectId,
    reference,
    parentEmail: email,
    parentName: String(metadata.parent_name || 'Parent / Guardian'),
    studentName: String(metadata.student_name || 'Learner'),
    programmeTitle: String(
      metadata.program_title || metadata.program_name || metadata.enrollment_type || 'Rillcod programme',
    ),
    schedule: metadata.preferred_schedule ? String(metadata.preferred_schedule) : null,
    amount: Number(transaction.amount) || Number(metadata.amount_charged) || 0,
    paymentUrl,
    paymentMethod: 'paystack',
    totalTuition: Number(metadata.total_tuition) || undefined,
    balanceDue: Number(metadata.balance_due) || undefined,
    balancePageKind: isTerm ? 'term' : 'special',
    force: true,
  });

  if (!delivery.delivered) {
    return NextResponse.json(
      {
        error: delivery.error || 'The payment email could not be sent. Contact support with your reference.',
        reference,
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    success: true,
    delivered: true,
    reference,
    message: 'Payment instructions were sent again. Check Inbox, Promotions and Spam.',
  });
}
