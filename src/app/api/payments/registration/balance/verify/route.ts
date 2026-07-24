import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/config/env';
import { isCompletedPaymentStatus } from '@/lib/registration/payment-state';
import { isTermRegistrationBalancePaymentType } from '@/lib/registration/enrollment-types';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** GET /api/payments/registration/balance/verify?reference=REG-BAL-... */
export async function GET(req: Request) {
  try {
    const reference = new URL(req.url).searchParams.get('reference')?.trim();
    if (!reference) {
      return NextResponse.json({ error: 'Payment reference is required' }, { status: 400 });
    }

    const supabase = adminClient();
    const { data: tx } = await supabase
      .from('payment_transactions')
      .select('id, payment_status, payment_gateway_response, transaction_reference')
      .eq('transaction_reference', reference)
      .maybeSingle();

    if (!tx) {
      return NextResponse.json({ error: 'Unknown payment reference' }, { status: 404 });
    }

    const gateway = (tx.payment_gateway_response ?? {}) as Record<string, unknown>;
    if (!isTermRegistrationBalancePaymentType(String(gateway.payment_type || ''))) {
      return NextResponse.json({ error: 'Invalid term balance payment reference' }, { status: 400 });
    }

    if (!isCompletedPaymentStatus(tx.payment_status)) {
      if (!env.PAYSTACK_SECRET_KEY) {
        return NextResponse.json({ ok: false, status: 'pending' });
      }
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

    return NextResponse.json({ ok: true, reference, payment_type: gateway.payment_type });
  } catch (err: unknown) {
    console.error('[registration/balance/verify] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Verification failed' },
      { status: 500 },
    );
  }
}
