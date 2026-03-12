import { NextResponse } from 'next/server';
import crypto from 'crypto';
import Stripe from 'stripe';
import { env } from '@/config/env';
import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';

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

    if (endpointSecret) {
        try {
            event = stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);
        } catch (err: any) {
            console.error(`Webhook Error: ${err.message}`);
            return NextResponse.json({ error: 'Webhook Error' }, { status: 400 });
        }
    } else {
        event = JSON.parse(rawBody);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as any;
        await processSuccessfulPayment(session.client_reference_id as string, 'stripe', session);
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
        await processSuccessfulPayment(event.data.reference, 'paystack', event.data);
    }

    return NextResponse.json({ received: true });
}

async function processSuccessfulPayment(reference: string, method: string, rawGatewayData: any) {
    const supabase = await createClient();

    // 1. Get transaction
    const { data: transaction, error: txError } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('transaction_reference', reference)
        .single();

    if (txError || !transaction) {
        console.error(`Transaction not found for success webhook: ${reference}`);
        return;
    }

    // 2. Prevent duplicate processing
    if (transaction.payment_status === 'completed') {
        return;
    }

    // 3. Mark completed
    await supabase
        .from('payment_transactions')
        .update({
            payment_status: 'completed',
            paid_at: new Date().toISOString(),
            payment_gateway_response: rawGatewayData
        })
        .eq('id', transaction.id);

    // 4. Grant access — behaviour differs by payment type
    const gatewayResponse = transaction.payment_gateway_response as any;
    const isRegistrationPayment = gatewayResponse?.payment_type === 'registration';

    if (isRegistrationPayment) {
        // Registration fee paid — mark the student record so admin can see payment is confirmed
        const studentId = gatewayResponse?.student_id;
        if (studentId) {
            await supabase
                .from('students')
                .update({ status: 'pending' }) // remains pending for admin approval, payment confirmed via payment_transactions
                .eq('id', studentId)
                .eq('status', 'pending'); // only touch if still pending, not already approved/rejected
        }
    } else if ((transaction as any).invoice_id) {
        // Invoice paid — update invoice status
        await (supabase as any)
            .from('invoices')
            .update({ 
                status: 'paid',
                payment_transaction_id: transaction.id,
                updated_at: new Date().toISOString()
            })
            .eq('id', (transaction as any).invoice_id);
    }

    // 5. Generate Receipt automatically (Task 23.1)
    const { paymentsService } = await import('@/services/payments.service');
    try {
        await paymentsService.generateReceipt(transaction.id);
    } catch (err) {
        console.error('Failed to generate automated receipt:', err);
    }
}
