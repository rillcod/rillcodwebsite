import { NextResponse } from 'next/server';
import crypto from 'crypto';
import Stripe from 'stripe';
import { env } from '@/config/env';
import { AppError } from '@/lib/errors';
import { processSuccessfulPayment } from '@/lib/payments/process-successful-payment';
import { createAdminClient } from '@/lib/supabase/admin';

function assertServiceRoleWebhook() {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new AppError('SUPABASE_SERVICE_ROLE_KEY is required for payment webhooks', 500);
    }
}

export async function POST(req: Request) {
    try {
        const rawBody = await req.text();
        const headers = req.headers;

        // Detect if Stripe or Paystack
        const stripeSignature = headers.get('stripe-signature');
        const paystackSignature = headers.get('x-paystack-signature');

        if (stripeSignature) {
            return handleStripeWebhook(rawBody, stripeSignature);
        } else if (paystackSignature) {
            return handlePaystackWebhook(rawBody, paystackSignature);
        }

        return NextResponse.json({ error: 'Unknown webhook origin' }, { status: 400 });
    } catch (error: any) {
        console.error('Webhook error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

async function handleStripeWebhook(rawBody: string, signature: string) {
    if (!env.STRIPE_SECRET_KEY) throw new AppError('Stripe missing', 500);

    const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' as any });

    // In production Stripe gives you an endpoint secret
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event;

    if (!endpointSecret) {
        // Fail closed — accepting unsigned Stripe webhooks is unsafe.
        return NextResponse.json({ error: 'Stripe webhook misconfigured' }, { status: 500 });
    }
    try {
        event = stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);
    } catch (err: any) {
        console.error(`Webhook Error: ${err.message}`);
        return NextResponse.json({ error: 'Webhook Error' }, { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
        assertServiceRoleWebhook();
        const session = event.data.object as any;
        await processSuccessfulPayment(session.client_reference_id as string, 'stripe', session);
    } else {
        console.info(`Ignoring Stripe webhook type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
}

async function handlePaystackWebhook(rawBody: string, signature: string) {
    if (!env.PAYSTACK_SECRET_KEY) throw new AppError('Paystack missing', 500);

    // Verify HMAC signature (timing-safe compare)
    const hash = crypto.createHmac('sha512', env.PAYSTACK_SECRET_KEY).update(rawBody).digest('hex');
    const hashBuf = Buffer.from(hash, 'utf8');
    const sigBuf = Buffer.from(signature || '', 'utf8');
    if (hashBuf.length !== sigBuf.length || !crypto.timingSafeEqual(hashBuf, sigBuf)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const event = JSON.parse(rawBody);

    if (event.event === 'charge.success') {
        assertServiceRoleWebhook();

        // Verify what Paystack says was charged covers what we recorded as due.
        // event.data.amount is in minor units and includes any fee gross-up, so
        // it must be >= the stored (net) transaction amount in the same currency.
        const reference = event.data?.reference as string;
        const db = createAdminClient();
        const { data: pendingTx } = await db
            .from('payment_transactions')
            .select('id, amount, currency, payment_status')
            .eq('transaction_reference', reference)
            .maybeSingle();
        if (pendingTx && !['completed', 'success', 'paid'].includes(String(pendingTx.payment_status || '').toLowerCase())) {
            const paidMajor = Number(event.data?.amount || 0) / 100;
            const expectedMajor = Number(pendingTx.amount || 0);
            const eventCurrency = String(event.data?.currency || '').toUpperCase();
            const txCurrency = String(pendingTx.currency || 'NGN').toUpperCase();
            if (eventCurrency && txCurrency && eventCurrency !== txCurrency) {
                console.error(`[webhook] currency mismatch for ${reference}: event=${eventCurrency} tx=${txCurrency}`);
                return NextResponse.json({ error: 'Currency mismatch' }, { status: 400 });
            }
            if (paidMajor + 1 < expectedMajor) {
                console.error(`[webhook] underpayment for ${reference}: paid=${paidMajor} expected=${expectedMajor}`);
                return NextResponse.json({ error: 'Amount below recorded charge' }, { status: 400 });
            }
        }

        // Let pipeline failures propagate as 5xx so Paystack retries instead of
        // silently dropping side effects.
        await processSuccessfulPayment(reference, 'paystack', event.data);
    } else {
        console.info(`Ignoring Paystack webhook event: ${event.event}`);
    }

    return NextResponse.json({ received: true });
}
