import { NextResponse } from 'next/server';
import crypto from 'crypto';
import Stripe from 'stripe';
import { env } from '@/config/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppError } from '@/lib/errors';
import { buildRillcodTransactionalEmailHtml, escapeHtml } from '@/lib/email/rillcod-transactional-email';

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

    // 1. Idempotency check — Req 6.3: return early if already processed
    const { data: existingTx } = await supabase
        .from('payment_transactions')
        .select('id, payment_status, invoice_id')
        .eq('transaction_reference', reference)
        .maybeSingle();

    if (existingTx?.payment_status === 'completed') {
        // Already processed — return silently (Req 6.3)
        return;
    }

    // 2. Get full transaction record
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
        // Invoice paid — use atomic RPC to update both payment_transactions and invoices (Req 6.1)
        const { error: rpcError } = await supabase.rpc('process_payment_atomic', {
            p_reference: reference,
            p_invoice_id: (transaction as any).invoice_id,
            p_amount: Number(transaction.amount),
        });
        if (rpcError) {
            console.error('process_payment_atomic RPC failed:', rpcError);
            return;
        }
    }

    // 4. Generate Receipt automatically (Task 23.1)
    const { paymentsService } = await import('@/services/payments.service');
    const { notificationsService } = await import('@/services/notifications.service');
    const { queueService } = await import('@/services/queue.service');
    
    try {
        const receiptUrl = await paymentsService.generateReceipt(transaction.id);

        // Notify all admins + teachers linked to this school of the confirmed payment
        const { notifyStaffOfPayment } = await import('@/lib/payments/notify-staff');
        const schoolId = (transaction as any).school_id as string | null;
        const amtFormatted = `${(transaction as any).currency || 'NGN'} ${Number((transaction as any).amount).toLocaleString()}`;
        const payer = isRegistrationPayment
          ? String(gatewayResponse?.student_name || 'A registrant')
          : 'A user';
        void notifyStaffOfPayment({
          schoolId,
          title: 'Payment Confirmed',
          message: `${payer} payment of ${amtFormatted} confirmed (ref: ${String((transaction as any).transaction_reference || '').slice(0, 12)}…).`,
          actionUrl: '/dashboard/finance?tab=billing',
        });

        const adminTo = env.ADMIN_OPS_EMAIL?.trim();
        if (
            isRegistrationPayment &&
            adminTo &&
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(adminTo)
        ) {
            try {
                const studName = String(gatewayResponse?.student_name || 'Student');
                const amt = `${transaction.currency || 'NGN'} ${Number(transaction.amount).toLocaleString()}`;
                const opsHtml = buildRillcodTransactionalEmailHtml({
                    eyebrow: 'Operations',
                    title: 'Registration fee received',
                    bodyHtml: `<p style="margin:0 0 10px;">A new student registration payment has been confirmed via the payment gateway.</p>`,
                    summaryRows: [
                        { label: 'Student', value: studName },
                        { label: 'Amount', value: amt },
                        { label: 'Reference', value: String(transaction.transaction_reference) },
                    ],
                    footerNote: '<span style="color:#a1a1aa;">Internal ops notice — not a receipt for the payer.</span>',
                });
                await notificationsService.sendExternalEmail({
                    to: adminTo,
                    subject: `New registration payment — ${studName}`,
                    fromName: 'Rillcod Academy',
                    fromEmail: 'support@rillcod.com',
                    html: opsHtml,
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
            const payLine = `${transaction.currency} ${Number(transaction.amount).toLocaleString()}`;
            const parentHtml = buildRillcodTransactionalEmailHtml({
                title: 'Registration confirmed',
                bodyHtml: `<p style="margin:0 0 10px;">Thank you for your registration payment of <strong style="color:#fff;">${escapeHtml(payLine)}</strong>.</p>
                        <p style="margin:0;">Our team will review the application and follow up by email.</p>`,
                summaryRows: [{ label: 'Reference', value: String(transaction.transaction_reference) }],
                cta: { href: receiptUrl, label: 'Download receipt (PDF)' },
                footerNote: '<span style="color:#a1a1aa;">Rillcod Academy — STEM &amp; coding education.</span>',
            });
            await notificationsService.sendExternalEmail({
                to: parentEmail,
                subject: 'Registration Confirmed — Rillcod Academy',
                fromName: 'Rillcod Academy',
                fromEmail: 'support@rillcod.com',
                html: parentHtml,
            });
        } else if (transaction.portal_user_id) {
            const { data: portalUsers } = await supabase
                .from('portal_users')
                .select('id, email, full_name')
                .eq('id', transaction.portal_user_id)
                .maybeSingle();

            if (portalUsers?.email) {
                const greet = escapeHtml(portalUsers.full_name || 'Student');
                const amtLine = `${transaction.currency} ${Number(transaction.amount).toLocaleString()}`;
                const portalHtml = buildRillcodTransactionalEmailHtml({
                    title: 'Payment received',
                    bodyHtml: `<p style="margin:0 0 8px;">Hi ${greet},</p>
                        <p style="margin:0 0 10px;">Thank you for your payment of <strong style="color:#fff;">${escapeHtml(amtLine)}</strong>.</p>
                        <p style="margin:0;">Your transaction was successful and your access has been updated.</p>`,
                    summaryRows: [{ label: 'Reference', value: String(transaction.transaction_reference) }],
                    cta: { href: receiptUrl, label: 'Download official receipt' },
                    footerNote: '<span style="color:#a1a1aa;">Rillcod Academy — STEM &amp; coding education.</span>',
                });
                await notificationsService.sendEmail(portalUsers.id, {
                    to: portalUsers.email,
                    subject: 'Payment Receipt: Rillcod Academy',
                    html: portalHtml,
                });
                
                // Fire instant notification (email queue)
                queueService.queueNotification(portalUsers.id, 'email', {
                    to: portalUsers.email,
                    subject: `Payment Receipt: Rillcod Academy`,
                    html: `Hi ${greet}! Your payment of ${amtLine} (Ref: ${String(transaction.transaction_reference)}) was successful.`
                }).catch(console.error);
            }
        }
    } catch (err) {
        console.error('Failed to generate automated receipt or notify user:', err);
    }
}
