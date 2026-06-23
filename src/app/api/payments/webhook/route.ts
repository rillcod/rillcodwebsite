import { NextResponse } from 'next/server';
import crypto from 'crypto';
import Stripe from 'stripe';
import { env } from '@/config/env';
import { AppError } from '@/lib/errors';
import { processSuccessfulPayment } from '@/lib/payments/process-successful-payment';

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

    // Verify HMAC signature
    const hash = crypto.createHmac('sha512', env.PAYSTACK_SECRET_KEY).update(rawBody).digest('hex');
    if (hash !== signature) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const event = JSON.parse(rawBody);

    if (event.event === 'charge.success') {
        assertServiceRoleWebhook();
        await processSuccessfulPayment(event.data.reference, 'paystack', event.data);
    } else {
        console.info(`Ignoring Paystack webhook event: ${event.event}`);
    }

    return NextResponse.json({ received: true });
}
