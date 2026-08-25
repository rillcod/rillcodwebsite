import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/config/env';
import { isCompletedPaymentStatus } from '@/lib/registration/payment-state';
import { shouldAutoEnrolOnlinePaystack } from '@/lib/registration/onboard-paid-student';
import { checkCustomRateLimit, getClientIp } from '@/proxies/rateLimit.proxy';
import { RateLimitError } from '@/lib/errors';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(req: Request) {
  try {
    try {
      await checkCustomRateLimit({
        key: `paystack-verify:${getClientIp(req as any)}`,
        max: 10,
        window: 60,
      });
    } catch (err) {
      if (err instanceof RateLimitError) {
        return NextResponse.json(
          { error: 'Too many verification attempts. Please wait before trying again.', retryAfter: (err as any).retryAfter ?? 60 },
          { status: 429 },
        );
      }
    }

    const reference = new URL(req.url).searchParams.get('reference')?.trim();
    if (!reference) {
      return NextResponse.json({ error: 'Payment reference is required' }, { status: 400 });
    }

    if (!env.PAYSTACK_SECRET_KEY) {
      return NextResponse.json({ error: 'Payment gateway is not configured' }, { status: 500 });
    }

    const supabase = adminClient();
    const { data: tx } = await supabase
      .from('payment_transactions')
      .select('id, amount, currency, invoice_id, payment_status, payment_gateway_response, transaction_reference')
      .eq('transaction_reference', reference)
      .maybeSingle();

    if (!tx) {
      return NextResponse.json({ error: 'Unknown payment reference' }, { status: 404 });
    }

    const gateway = (tx.payment_gateway_response ?? {}) as Record<string, unknown>;
    if (gateway.payment_type !== 'registration') {
      return NextResponse.json({ error: 'Invalid registration payment reference' }, { status: 400 });
    }

    const studentId = gateway.student_id as string | undefined;
    if (!studentId) {
      return NextResponse.json({ error: 'Payment is not linked to a student registration' }, { status: 400 });
    }

    if (!isCompletedPaymentStatus(tx.payment_status)) {
      const paystackRes = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` } },
      );
      const paystackData = await paystackRes.json();
      const verified = paystackData.status === true && paystackData?.data?.status === 'success';

      if (!verified) {
        return NextResponse.json({
          ok: false,
          status: paystackData?.data?.status ?? 'unknown',
          reference,
        });
      }

      const { processSuccessfulPayment } = await import('@/lib/payments/process-successful-payment');
      await processSuccessfulPayment(reference, 'paystack', paystackData.data);
    }

    const { data: stud } = await supabase
      .from('students')
      .select('status, enrollment_type, user_id, student_email, parent_email, parent_name, parent_phone, school_id, school_name, full_name, name')
      .eq('id', studentId)
      .maybeSingle();

    const autoOnboarded =
      stud?.status === 'approved' &&
      shouldAutoEnrolOnlinePaystack(stud.enrollment_type, 'paystack');

    if (autoOnboarded && stud?.user_id) {
      try {
        const { sendTermRegistrationActivation } = await import('@/lib/registration/term-activation');
        await sendTermRegistrationActivation(supabase as any, { id: studentId, ...stud });
      } catch (activationErr) {
        console.error('[registration/verify] activation retry failed:', activationErr);
      }
    }

    return NextResponse.json({
      ok: true,
      reference,
      studentName: gateway.student_name ?? null,
      autoOnboarded,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Verification failed';
    console.error('Registration payment verify error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
