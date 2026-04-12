import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { paymentsService } from '@/services/payments.service';
import { env } from '@/config/env';

/**
 * Called by Supabase Edge paystack-webhook (inline mode) after marking a transaction completed.
 * Secured with PAYMENT_WEBHOOK_INTERNAL_SECRET — same value in Edge secrets and this app env.
 */
export async function POST(req: Request) {
  const secret = env.PAYMENT_WEBHOOK_INTERNAL_SECRET || env.PAYMENT_INTERNAL_RECEIPT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Receipt hook not configured' }, { status: 503 });
  }
  if (req.headers.get('x-rillcod-payment-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { transactionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const transactionId = body.transactionId;
  if (!transactionId) {
    return NextResponse.json({ error: 'transactionId required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: tx } = await admin
    .from('payment_transactions')
    .select('id, payment_status')
    .eq('id', transactionId)
    .maybeSingle();

  if (!tx || tx.payment_status !== 'completed') {
    return NextResponse.json({ error: 'Transaction not ready for receipt' }, { status: 400 });
  }

  try {
    await paymentsService.generateReceipt(transactionId);
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Receipt failed';
    console.error('[generate-receipt]', message, e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
