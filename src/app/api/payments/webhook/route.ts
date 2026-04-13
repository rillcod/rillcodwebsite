import { NextResponse } from 'next/server';
import crypto from 'crypto';
import Stripe from 'stripe';
import { env } from '@/config/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppError } from '@/lib/errors';

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

async function processSuccessfulPayment(reference: string, method: string, rawGatewayData: any) {
    const supabase = createAdminClient();

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

    const prevGateway =
        transaction.payment_gateway_response &&
        typeof transaction.payment_gateway_response === 'object' &&
        !Array.isArray(transaction.payment_gateway_response)
            ? (transaction.payment_gateway_response as Record<string, unknown>)
            : {};

    const mergedGateway =
        method === 'paystack'
            ? { ...prevGateway, paystack: rawGatewayData }
            : { ...prevGateway, stripe: rawGatewayData };

    // 2. Prevent duplicate processing atomically (handles retries/races)
    const { data: updatedTx, error: updateErr } = await supabase
        .from('payment_transactions')
        .update({
            payment_status: 'completed',
            paid_at: new Date().toISOString(),
            payment_gateway_response: mergedGateway as any,
        })
        .eq('id', transaction.id)
        .neq('payment_status', 'completed')
        .select('id')
        .maybeSingle();
    if (updateErr) {
        console.error(`Failed to mark transaction completed: ${reference}`, updateErr);
        return;
    }
    // Already completed by a previous/concurrent webhook, so skip side effects.
    if (!updatedTx) {
        return;
    }

    // 3. Grant access — behaviour differs by payment type (metadata from DB insert survives merge)
    const gatewayResponse = mergedGateway as any;
    const isRegistrationPayment = gatewayResponse?.payment_type === 'registration';

    if (isRegistrationPayment) {
        const studentId = gatewayResponse?.student_id;
        if (!studentId) {
            console.error(`Registration payment missing student_id metadata: ${reference}`);
            return;
        }
        await supabase
            .from('students')
            .update({
                status: 'pending',
                registration_payment_at: new Date().toISOString(),
                registration_paystack_reference: method === 'paystack' ? reference : null,
            })
            .eq('id', studentId)
            .eq('status', 'pending');

        const { data: stud } = await supabase
            .from('students')
            .select('school_id, enrollment_type, full_name, name')
            .eq('id', studentId)
            .maybeSingle();

        const { data: existingInv } = await supabase
            .from('invoices')
            .select('id')
            .eq('payment_transaction_id', transaction.id)
            .maybeSingle();

        if (!existingInv) {
            const enrollLabel = String(gatewayResponse?.enrollment_type || stud?.enrollment_type || 'Registration');
            const progName = gatewayResponse?.program_name ? String(gatewayResponse.program_name) : '';
            const displayName = String(stud?.full_name || stud?.name || gatewayResponse?.student_name || 'Student');
            const rawRef = String(transaction.transaction_reference || transaction.id);
            const invoiceNumber = `INV-REG-${rawRef.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 48)}`;

            const { data: newInv, error: invErr } = await supabase
                .from('invoices')
                .insert({
                    invoice_number: invoiceNumber,
                    amount: Number(transaction.amount),
                    currency: transaction.currency || 'NGN',
                    status: 'paid',
                    due_date: null,
                    portal_user_id: null,
                    school_id: stud?.school_id ?? transaction.school_id ?? null,
                    payment_transaction_id: transaction.id,
                    items: [
                        {
                            description: progName ? `${enrollLabel} — ${progName}` : `${enrollLabel} Registration Fee`,
                            program_name: progName || null,
                            enrollment_type: enrollLabel,
                            unit_price: Number(transaction.amount),
                            quantity: 1,
                        },
                    ],
                    metadata: {
                        registration_student_id: studentId,
                        student_name: displayName,
                        source: 'registration_webhook',
                    },
                })
                .select('id')
                .single();

            if (invErr) {
                console.error('Failed to create registration invoice:', invErr);
            } else if (newInv?.id) {
                await supabase
                    .from('payment_transactions')
                    .update({ invoice_id: newInv.id })
                    .eq('id', transaction.id);
            }
        }
    } else if (gatewayResponse?.payment_type === 'billing_cycle' && gatewayResponse?.billing_cycle_id) {
        const billingCycleId = gatewayResponse.billing_cycle_id as string;
        const { data: cycle } = await (supabase as any)
            .from('billing_cycles')
            .select('id, sticky_notice_id')
            .eq('id', billingCycleId)
            .maybeSingle();

        await (supabase as any)
            .from('billing_cycles')
            .update({
                status: 'paid',
                updated_at: new Date().toISOString(),
            })
            .eq('id', billingCycleId)
            .neq('status', 'paid');

        if (cycle?.sticky_notice_id) {
            await (supabase as any)
                .from('billing_notices')
                .update({
                    is_resolved: true,
                    resolved_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', cycle.sticky_notice_id);
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

    // 4. Generate Receipt automatically (Task 23.1)
    const { paymentsService } = await import('@/services/payments.service');
    const { notificationsService } = await import('@/services/notifications.service');
    
    try {
        const receiptUrl = await paymentsService.generateReceipt(transaction.id);

        const adminTo = env.ADMIN_OPS_EMAIL?.trim();
        if (
            isRegistrationPayment &&
            adminTo &&
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(adminTo)
        ) {
            try {
                const studName = String(gatewayResponse?.student_name || 'Student');
                const amt = `${transaction.currency || 'NGN'} ${Number(transaction.amount).toLocaleString()}`;
                await notificationsService.sendExternalEmail({
                    to: adminTo,
                    subject: `New registration payment — ${studName}`,
                    fromName: 'Rillcod Academy',
                    fromEmail: 'support@rillcod.com',
                    html: `<div style="font-family:sans-serif;max-width:560px;padding:16px;">
            <p><strong>Registration fee received</strong></p>
            <p>Student: ${studName}<br/>Amount: ${amt}<br/>Reference: ${transaction.transaction_reference}</p>
            <p style="color:#64748b;font-size:12px;">Internal ops notice (email).</p>
          </div>`,
                });
            } catch (opsErr) {
                console.error('Admin ops registration email failed:', opsErr);
            }
        }

        const parentEmail =
            typeof gatewayResponse?.parent_email === 'string'
                ? gatewayResponse.parent_email.trim()
                : '';

        if (isRegistrationPayment && parentEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(parentEmail)) {
            await notificationsService.sendExternalEmail({
                to: parentEmail,
                subject: 'Registration Confirmed — Rillcod Academy',
                fromName: 'Rillcod Academy',
                fromEmail: 'support@rillcod.com',
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee;">
                        <h2 style="color: #4f46e5;">Payment Received</h2>
                        <p>Thank you for your registration payment of <strong>${transaction.currency} ${Number(transaction.amount).toLocaleString()}</strong>.</p>
                        <p style="color: #64748b; font-size: 12px;">Reference: ${transaction.transaction_reference}</p>
                        <div style="margin: 30px 0;">
                            <a href="${receiptUrl}" style="background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Download receipt (PDF)</a>
                        </div>
                        <p>Our team will review the application and follow up by email.</p>
                        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                        <p style="font-size: 10px; color: #94a3b8;">Rillcod Academy — STEM & Coding Education</p>
                    </div>`,
            });
        } else if (transaction.portal_user_id) {
            const { data: portalUsers } = await supabase
                .from('portal_users')
                .select('id, email, full_name')
                .eq('id', transaction.portal_user_id)
                .maybeSingle();

            if (portalUsers?.email) {
                await notificationsService.sendEmail(portalUsers.id, {
                    to: portalUsers.email,
                    subject: 'Payment Receipt: Rillcod Academy',
                    html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee;">
                        <h2 style="color: #4f46e5;">Payment Received!</h2>
                        <p>Hi ${portalUsers.full_name || 'Student'},</p>
                        <p>Thank you for your payment of <strong>${transaction.currency} ${transaction.amount.toLocaleString()}</strong>.</p>
                        <p>Your transaction was successful and your access has been updated.</p>
                        <div style="margin: 30px 0;">
                            <a href="${receiptUrl}" style="background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Download Official Receipt</a>
                        </div>
                        <p style="color: #64748b; font-size: 12px;">Reference: ${transaction.transaction_reference}</p>
                        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                        <p style="font-size: 10px; color: #94a3b8;">Rillcod Academy &bull; STEM & Coding Education</p>
                    </div>
                `,
                });
            }
        }
    } catch (err) {
        console.error('Failed to generate automated receipt or notify user:', err);
    }
}
