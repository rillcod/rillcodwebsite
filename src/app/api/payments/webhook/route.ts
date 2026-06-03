import { NextResponse } from 'next/server';
import crypto from 'crypto';
import Stripe from 'stripe';
import { env } from '@/config/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppError } from '@/lib/errors';
import { buildRillcodTransactionalEmailHtml, buildPaymentConfirmationEmail, escapeHtml } from '@/lib/email/rillcod-transactional-email';

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
    } else if (gatewayResponse?.payment_type === 'summer_school_balance') {
        const prospectId = gatewayResponse?.prospect_id;
        if (prospectId) {
            await supabase
                .from('prospective_students')
                .update({ status: 'paid', updated_at: new Date().toISOString() })
                .eq('id', prospectId);
        }
    } else if (gatewayResponse?.payment_type === 'summer_school') {
        const prospectId = gatewayResponse?.prospect_id;
        if (prospectId) {
            // Retrieve prospective student details to auto-provision
            const { data: record } = await supabase
                .from('prospective_students')
                .select('*')
                .eq('id', prospectId)
                .maybeSingle();

            if (record) {
                const loginEmail = record.email || record.parent_email;
                if (loginEmail) {
                    const crypto = await import('crypto');
                    const password = crypto.randomBytes(8).toString('base64url').slice(0, 10);
                    const normalizedEmail = loginEmail.trim().toLowerCase();
                    let authUserId: string | null = null;

                    // Parse student phone if present in notes
                    const notesStr = record.notes || '';
                    const studentPhoneMatch = notesStr.match(/\[Student Phone:\s*([^\]]+)\]/i);
                    const studentPhone = studentPhoneMatch ? studentPhoneMatch[1].trim() : null;
                    const studentPhoneOrParentPhone = studentPhone || record.parent_phone || null;

                    // Check portal_users by email first
                    const { data: existingPortal } = await supabase
                        .from('portal_users')
                        .select('id')
                        .eq('email', normalizedEmail)
                        .maybeSingle();

                    if (existingPortal) {
                        await supabase.from('portal_users').update({
                            role: 'student',
                            full_name: record.full_name,
                            school_name: record.school_name || 'Direct / Summer School',
                            school_id: record.school_id || null,
                            class_id: null,
                            date_of_birth: record.age ? `${new Date().getFullYear() - record.age}-01-01` : null,
                            section_class: record.grade || null,
                            is_active: true,
                            enrollment_type: 'summer_school',
                            phone: studentPhoneOrParentPhone,
                            updated_at: new Date().toISOString(),
                        }).eq('id', existingPortal.id);

                        await supabase.auth.admin.updateUserById(existingPortal.id, {
                            password,
                            user_metadata: { full_name: record.full_name, role: 'student' },
                        });

                        authUserId = existingPortal.id;
                    } else {
                        // Create auth user
                        const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
                            email: loginEmail,
                            password,
                            email_confirm: true,
                            user_metadata: {
                                full_name: record.full_name,
                                role: 'student',
                            },
                        });

                        if (authErr) {
                            const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
                            const existing = listData?.users?.find(
                                u => u.email?.trim().toLowerCase() === normalizedEmail
                            );
                            if (existing) {
                                authUserId = existing.id;
                                await supabase.auth.admin.updateUserById(authUserId, {
                                    password,
                                    user_metadata: { full_name: record.full_name, role: 'student' },
                                });
                            }
                        } else {
                            authUserId = authData?.user?.id ?? null;
                        }

                        if (authUserId) {
                            await supabase.from('portal_users').upsert({
                                id: authUserId,
                                email: normalizedEmail,
                                full_name: record.full_name,
                                role: 'student',
                                school_name: record.school_name || 'Direct / Summer School',
                                school_id: record.school_id || null,
                                class_id: null,
                                date_of_birth: record.age ? `${new Date().getFullYear() - record.age}-01-01` : null,
                                section_class: record.grade || null,
                                is_active: true,
                                enrollment_type: 'summer_school',
                                phone: studentPhoneOrParentPhone,
                                updated_at: new Date().toISOString(),
                            }, { onConflict: 'id' });
                        }
                    }

                    if (authUserId) {
                        // Check student record in students table
                        const { data: existingStudent } = await supabase
                            .from('students')
                            .select('id')
                            .eq('user_id', authUserId)
                            .maybeSingle();

                        const studentPayload = {
                            full_name: record.full_name,
                            name: record.full_name,
                            email: record.email || record.parent_email,
                            student_email: record.email || null,
                            parent_name: record.parent_name,
                            parent_email: record.parent_email,
                            parent_phone: record.parent_phone,
                            phone: studentPhoneOrParentPhone,
                            age: record.age,
                            gender: record.gender,
                            grade: record.grade,
                            grade_level: record.grade,
                            current_class: record.grade,
                            school_id: record.school_id || null,
                            school_name: record.school_name || 'Direct / Summer School',
                            course_interest: record.course_interest || 'Summer School 2026',
                            preferred_schedule: record.preferred_schedule,
                            enrollment_type: 'summer_school',
                            status: 'approved',
                            is_active: true,
                            is_deleted: false,
                            user_id: authUserId,
                            approved_at: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                        };

                        if (existingStudent) {
                            await supabase.from('students').update(studentPayload).eq('id', existingStudent.id);
                        } else {
                            await supabase.from('students').insert({
                                ...studentPayload,
                                created_at: new Date().toISOString(),
                            });
                        }
                    }

                    // Save temporary password to transmit to the parent
                    gatewayResponse.generated_credentials = { email: loginEmail, password };
                }
            }

            await supabase
                .from('prospective_students')
                .update({
                    status: gatewayResponse?.payment_plan === 'installment' ? 'partially_paid' : 'paid',
                    is_active: true,
                })
                .eq('id', prospectId);
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
          actionUrl: '/dashboard/finance?tab=billing_cycles',
        });

        const adminTo = env.ADMIN_OPS_EMAIL?.trim();
        const isSummerPayment =
            gatewayResponse?.payment_type === 'summer_school' ||
            gatewayResponse?.payment_type === 'summer_school_balance';
        if (
            (isRegistrationPayment || isSummerPayment) &&
            adminTo &&
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(adminTo)
        ) {
            try {
                const studName = String(gatewayResponse?.student_name || 'Student');
                const amt = `${transaction.currency || 'NGN'} ${Number(transaction.amount).toLocaleString()}`;
                const opsHtml = buildRillcodTransactionalEmailHtml({
                    eyebrow: 'Operations',
                    title: isSummerPayment ? 'Summer School payment received' : 'Registration fee received',
                    bodyHtml: `<p style="margin:0 0 10px;">${isSummerPayment ? 'A Summer School tuition payment has been confirmed via the payment gateway.' : 'A new student registration payment has been confirmed via the payment gateway.'}</p>`,
                    summaryRows: [
                        { label: 'Student', value: studName },
                        { label: 'Amount', value: amt },
                        { label: 'Reference', value: String(transaction.transaction_reference) },
                        ...(isSummerPayment ? [{ label: 'Type', value: String(gatewayResponse?.payment_type) }] : []),
                    ],
                    footerNote: '<span style="color:#a1a1aa;">Internal ops notice — not a receipt for the payer.</span>',
                });
                await notificationsService.sendExternalEmail({
                    to: adminTo,
                    subject: isSummerPayment ? `Summer School payment — ${studName}` : `New registration payment — ${studName}`,
                    fromName: 'Rillcod Technologies',
                    fromEmail: 'support@rillcod.com',
                    html:      opsHtml,
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
            const studName = String(gatewayResponse?.student_name || 'Student');
            const parentHtml = buildPaymentConfirmationEmail({
                recipientName: studName,
                amount:        Number(transaction.amount),
                currency:      String(transaction.currency || 'NGN'),
                reference:     String(transaction.transaction_reference),
                description:   'Student Registration Fee',
                date:          new Date().toISOString(),
                portalUrl:     receiptUrl,
            });
            await notificationsService.sendExternalEmail({
                to:        parentEmail,
                subject:   `Registration Confirmed — Rillcod Technologies (Ref: ${String(transaction.transaction_reference).slice(0, 12)})`,
                fromName:  'Rillcod Technologies',
                fromEmail: 'support@rillcod.com',
                html:      parentHtml,
            });
        } else if (gatewayResponse?.payment_type === 'summer_school' && parentEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(parentEmail)) {
            const studName = String(gatewayResponse?.student_name || 'Student');
            const creds = gatewayResponse?.generated_credentials;
            const isInstallment = gatewayResponse?.payment_plan === 'installment';
            const balanceDue = Number(gatewayResponse?.balance_due || 0);
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com';
            const balanceLink = `${baseUrl}/summer-school/pay-balance?email=${encodeURIComponent(parentEmail)}`;
            const balanceSection = isInstallment && balanceDue > 0
              ? `<div style="margin:20px 0;padding:15px;background-color:#fffbeb;border:1px solid #fcd34d;border-radius:8px;">
                   <h4 style="margin:0 0 10px;color:#92400e;">Installment — Balance Due</h4>
                   <p style="margin:0 0 8px;font-size:13px;color:#78350f;">Your deposit (50%) has been received. The remaining <strong>₦${balanceDue.toLocaleString()}</strong> is due by week 3 of the cohort.</p>
                   <p style="margin:0;font-size:13px;"><a href="${balanceLink}" style="color:#2563eb;font-weight:bold;">Pay remaining balance online →</a></p>
                 </div>`
              : '';
            const credsSection = creds
              ? `<div style="margin:20px 0;padding:15px;background-color:#f4f4f5;border:1px solid #e4e4e7;border-radius:8px;">
                   <h4 style="margin:0 0 10px;color:#18181b;">Your Portal Credentials</h4>
                   <p style="margin:0 0 5px;font-size:13px;color:#71717a;">We have auto-created an academy account for your child. They can log in to Rillcod to begin their learning journey.</p>
                   <p style="margin:8px 0;font-size:14px;color:#18181b;font-family:monospace;"><strong>Username (Email):</strong> ${creds.email}</p>
                   <p style="margin:8px 0;font-size:14px;color:#18181b;font-family:monospace;"><strong>Temporary Password:</strong> ${creds.password}</p>
                   <p style="margin:5px 0 0;font-size:12px;color:#a1a1aa;">Please log in at <a href="https://www.rillcod.com/login" style="color:#2563eb;">rillcod.com/login</a>. You can change this password at any time in the dashboard profile.</p>
                 </div>`
              : '';

            const parentHtml = buildPaymentConfirmationEmail({
                recipientName: studName,
                amount:        Number(transaction.amount),
                currency:      String(transaction.currency || 'NGN'),
                reference:     String(transaction.transaction_reference),
                description:   'AI Summer School 2026 Tuition',
                date:          new Date().toISOString(),
                portalUrl:     receiptUrl,
            });

            const finalHtml = (credsSection || balanceSection)
              ? parentHtml.replace('</p></div></td></tr>', `</p>${credsSection}${balanceSection}</div></td></tr>`)
              : parentHtml;

            await notificationsService.sendExternalEmail({
                to:        parentEmail,
                subject:   `AI Summer School Enrolment Confirmed — Rillcod (Ref: ${String(transaction.transaction_reference).slice(0, 12)})`,
                fromName:  'Rillcod Technologies',
                fromEmail: 'support@rillcod.com',
                html:      finalHtml,
            });
        } else if (gatewayResponse?.payment_type === 'summer_school_balance' && parentEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(parentEmail)) {
            const studName = String(gatewayResponse?.student_name || 'Student');
            const parentHtml = buildPaymentConfirmationEmail({
                recipientName: studName,
                amount:        Number(transaction.amount),
                currency:      String(transaction.currency || 'NGN'),
                reference:     String(transaction.transaction_reference),
                description:   'AI Summer School 2026 — Remaining Tuition Balance',
                date:          new Date().toISOString(),
                portalUrl:     receiptUrl,
            });
            await notificationsService.sendExternalEmail({
                to:        parentEmail,
                subject:   `Summer School Balance Paid — Rillcod (Ref: ${String(transaction.transaction_reference).slice(0, 12)})`,
                fromName:  'Rillcod Technologies',
                fromEmail: 'support@rillcod.com',
                html:      parentHtml,
            });
        } else if (transaction.portal_user_id) {
            const { data: portalUsers } = await supabase
                .from('portal_users')
                .select('id, email, full_name')
                .eq('id', transaction.portal_user_id)
                .maybeSingle();

            if (portalUsers?.email) {
                const portalHtml = buildPaymentConfirmationEmail({
                    recipientName: portalUsers.full_name || 'Student',
                    amount:        Number(transaction.amount),
                    currency:      String(transaction.currency || 'NGN'),
                    reference:     String(transaction.transaction_reference),
                    description:   'Platform Fee Payment',
                    date:          new Date().toISOString(),
                    portalUrl:     receiptUrl,
                });
                await notificationsService.sendEmail(portalUsers.id, {
                    to:        portalUsers.email,
                    subject:   `Payment Receipt — Rillcod Technologies (Ref: ${String(transaction.transaction_reference).slice(0, 12)})`,
                    fromName:  'Rillcod Technologies',
                    fromEmail: 'support@rillcod.com',
                    html:      portalHtml,
                });

                const amtLine = `${transaction.currency || 'NGN'} ${Number(transaction.amount).toLocaleString()}`;
                queueService.queueNotification(portalUsers.id, 'email', {
                    to:      portalUsers.email,
                    subject: `Payment Receipt — Rillcod Technologies`,
                    html:    `Hi ${portalUsers.full_name || 'there'}! Your payment of ${amtLine} (Ref: ${String(transaction.transaction_reference)}) was successful.`,
                }).catch(console.error);
            }
        }
    } catch (err) {
        console.error('Failed to generate automated receipt or notify user:', err);
    }
}
