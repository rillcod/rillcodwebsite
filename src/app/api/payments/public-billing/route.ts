import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { env } from '@/config/env';
import { verifyPublicBillingToken } from '@/lib/payments/public-billing-link';

export async function GET(request: Request) {
  try {
    if (!env.PAYSTACK_SECRET_KEY) {
      return NextResponse.json({ error: 'Paystack is not configured' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token') || '';
    const payload = verifyPublicBillingToken(token);
    if (!payload) return NextResponse.json({ error: 'Invalid or expired payment link' }, { status: 401 });

    const db = createAdminClient();
    const { data: cycle } = await db
      .from('billing_cycles')
      .select('id, owner_type, owner_school_id, owner_user_id, school_id, invoice_id, term_label, due_date, amount_due, currency, status')
      .eq('id', payload.cycleId)
      .maybeSingle();

    if (!cycle) return NextResponse.json({ error: 'Billing cycle not found' }, { status: 404 });
    if (cycle.status === 'paid') {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL || ''}/dashboard/payments?paid=1&cycle=${cycle.id}`);
    }
    if (cycle.status === 'cancelled') {
      return NextResponse.json({ error: 'Billing cycle is cancelled' }, { status: 400 });
    }

    let payerEmail = 'support@rillcod.com';
    if (cycle.owner_type === 'school' && cycle.owner_school_id) {
      const { data: contact } = await db
        .from('billing_contacts')
        .select('representative_email')
        .eq('school_id', cycle.owner_school_id)
        .maybeSingle();
      const { data: school } = await db
        .from('schools')
        .select('email')
        .eq('id', cycle.owner_school_id)
        .maybeSingle();
      payerEmail = contact?.representative_email || school?.email || payerEmail;
    } else if (cycle.owner_user_id) {
      const { data: owner } = await db.from('portal_users').select('email').eq('id', cycle.owner_user_id).maybeSingle();
      payerEmail = owner?.email || payerEmail;
    }

    const reference = `BILL-CYCLE-${cycle.id.slice(0, 8)}-${Date.now()}`;
    const amountKobo = Math.round(Number(cycle.amount_due || 0) * 100);
    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/dashboard/payments?paid=1&cycle=${cycle.id}`;

    const { data: tx } = await db
      .from('payment_transactions')
      .insert({
        portal_user_id: cycle.owner_user_id,
        school_id: cycle.owner_school_id || cycle.school_id || null,
        amount: Number(cycle.amount_due || 0),
        currency: cycle.currency || 'NGN',
        payment_method: 'paystack',
        payment_status: 'pending',
        transaction_reference: reference,
        invoice_id: cycle.invoice_id,
        payment_gateway_response: {
          payment_type: 'billing_cycle',
          billing_cycle_id: cycle.id,
          owner_type: cycle.owner_type,
          term_label: cycle.term_label,
        },
      })
      .select('id')
      .single();

    const paystackRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: payerEmail,
        amount: amountKobo,
        reference,
        currency: cycle.currency || 'NGN',
        callback_url: callbackUrl,
        metadata: {
          billing_cycle_id: cycle.id,
          transaction_id: tx?.id,
          term_label: cycle.term_label,
          cancel_action: callbackUrl,
        },
      }),
    });

    const paystackData = await paystackRes.json();
    if (!paystackData?.status || !paystackData?.data?.authorization_url) {
      return NextResponse.json({ error: paystackData?.message || 'Failed to start payment' }, { status: 500 });
    }

    return NextResponse.redirect(paystackData.data.authorization_url);
  } catch (error: any) {
    console.error('Public billing payment error:', error);
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

