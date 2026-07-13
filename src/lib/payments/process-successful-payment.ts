import { createAdminClient } from '@/lib/supabase/admin';
import { buildRillcodTransactionalEmailHtml, buildPaymentConfirmationEmail } from '@/lib/email/rillcod-transactional-email';
import { onboardSummerStudent, sendSummerCredentials } from '@/lib/summer-school/onboard';
import { getSummerProspectStatusForPayment } from '@/lib/registration/payment-state';
import { env } from '@/config/env';
import { syncRosterBillingForInvoice } from '@/lib/rosters/billing-sync';
import { ensureSettledInvoiceForTransaction } from '@/lib/finance/settled-invoice';
import { settleBillingCyclePayment } from '@/lib/finance/billing-cycle-payment';
import { SMTP_FROM_EMAIL } from '@/config/brand';

function isValidEmail(email: string | null | undefined) {
    return !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email);
}

/**
 * The SINGLE source of truth for "a payment succeeded → grant access + record finance".
 *
 * Used by BOTH the gateway webhook (Paystack/Stripe `charge.success`) AND the manual
 * approval route (`/api/payments/approve`, e.g. confirmed bank transfers). Keeping one
 * implementation guarantees a manually-confirmed bank transfer produces the SAME
 * cohesive record as an automatic gateway payment: transaction → completed, invoice
 * created, summer/registration student onboarded, receipt issued, staff notified.
 *
 * Idempotent: returns early if the transaction is already completed, and uses a
 * conditional update (`.neq('payment_status','completed')`) so concurrent
 * webhook/approval races only run side-effects once.
 *
 * Hard failures THROW so callers can react: the webhook returns 5xx (gateway
 * retries) and staff verification surfaces the error instead of a false success.
 */
export async function processSuccessfulPayment(reference: string, method: string, rawGatewayData: any) {
    const supabase = createAdminClient();

    // 1. Idempotency check — return early if already processed
    const { data: existingTx } = await supabase
        .from('payment_transactions')
        .select('id, payment_status, invoice_id, receipt_url, amount, currency, school_id, transaction_reference, payment_gateway_response')
        .eq('transaction_reference', reference)
        .maybeSingle();

    if (['completed', 'success', 'paid'].includes(String(existingTx?.payment_status || '').toLowerCase())) {
        // Repair required post-conditions left incomplete by an earlier attempt.
        const repairMetadata = existingTx?.payment_gateway_response && typeof existingTx.payment_gateway_response === 'object'
            ? existingTx.payment_gateway_response as any
            : {};
        if (repairMetadata?.payment_type === 'billing_cycle' && repairMetadata?.billing_cycle_id) {
            const cycleRepair = await settleBillingCyclePayment(supabase as any, {
                billingCycleId: String(repairMetadata.billing_cycle_id), transactionId: existingTx!.id,
            });
            if (!cycleRepair.ok) throw new Error(`Failed to repair billing cycle settlement: ${cycleRepair.error.message}`);
        }
        if (existingTx?.invoice_id) {
            const { error: invoiceRepairError } = await supabase
                .from('invoices')
                .update({ status: 'paid', payment_transaction_id: existingTx.id, updated_at: new Date().toISOString() })
                .eq('id', existingTx.invoice_id)
                .neq('status', 'paid');
            if (invoiceRepairError) throw new Error(`Failed to repair invoice settlement: ${invoiceRepairError.message}`);
        }
        if (!existingTx?.receipt_url) {
            const { paymentsService } = await import('@/services/payments.service');
            await paymentsService.generateReceipt(existingTx!.id);
        }
        return;
    }

    // 2. Get full transaction record
    const { data: transaction, error: txError } = await supabase
        .from('payment_transactions')
        .select('*')
        .eq('transaction_reference', reference)
        .single();

    if (txError || !transaction) {
        console.error(`Transaction not found for success: ${reference}`);
        throw new Error(`Transaction not found for reference ${reference}`);
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
            : method === 'stripe'
                ? { ...prevGateway, stripe: rawGatewayData }
                : { ...prevGateway, manual: rawGatewayData ?? { confirmed_at: new Date().toISOString() } };

    // 2a. Validate invoice amounts BEFORE flipping the transaction to completed.
    // Previously validation happened after the flip: a mismatch aborted the run,
    // and every retry then hit the idempotency guard — invoice permanently
    // unpaid with a "completed" transaction. Validating first keeps the
    // transaction pending (and retryable) until the numbers make sense.
    const preGateway = prevGateway as any;
    const isPlainInvoicePayment =
        !!(transaction as any).invoice_id &&
        !['registration', 'summer_school', 'summer_school_balance', 'billing_cycle'].includes(String(preGateway?.payment_type || ''));
    let validatedInvoice: any = null;
    if (isPlainInvoicePayment) {
        const { data: invoice, error: invFetchErr } = await (supabase as any)
            .from('invoices')
            .select('id, amount, original_amount, amount_paid, amount_remaining, status, payment_transaction_id, billing_cycle_id, school_id, invoice_number')
            .eq('id', (transaction as any).invoice_id)
            .maybeSingle();
        if (invFetchErr || !invoice) {
            console.error('Invoice not found for successful payment:', (transaction as any).invoice_id, invFetchErr);
            throw new Error(`Invoice ${(transaction as any).invoice_id} not found for payment ${reference}`);
        }

        const remaining = Number(
            invoice.amount_remaining != null
                ? invoice.amount_remaining
                : Math.max(0, Number(invoice.original_amount ?? invoice.amount ?? 0) - Number(invoice.amount_paid ?? 0)),
        );
        const expected = remaining > 0 ? remaining : Number(invoice.amount) || 0;
        const received = Number(transaction.amount) || 0;
        // Underpayment beyond remaining blocks settlement. Overpayment of remaining is tolerated.
        if (received + 1 < expected && remaining > 0) {
            console.error('Invoice payment amount mismatch:', {
                invoice_id: invoice.id,
                expected,
                received,
                remaining,
                reference,
            });
            try {
                const { notifyStaffOfPayment } = await import('@/lib/payments/notify-staff');
                void notifyStaffOfPayment({
                    schoolId: (transaction as any).school_id ?? null,
                    title: 'Payment needs review',
                    message: `Payment ${reference} received ${received} but invoice ${invoice.invoice_number || invoice.id} remaining is ${expected}. The invoice was NOT settled.`,
                    actionUrl: '/dashboard/finance?workspace=collections&ops=approvals',
                });
            } catch { /* best-effort alert */ }
            throw new Error(
                `Payment ${reference} amount (${received}) is below invoice ${invoice.invoice_number || invoice.id} remaining (${expected}).`,
            );
        }
        validatedInvoice = invoice;
    }

    // 2b. Prevent duplicate processing atomically (handles retries/races)
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
        throw new Error(`Failed to mark transaction completed for ${reference}: ${updateErr.message}`);
    }
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

            const settledInvoice = await ensureSettledInvoiceForTransaction(supabase as any, {
                transactionId: transaction.id,
                invoiceNumber,
                amount: Number(transaction.amount),
                currency: transaction.currency || 'NGN',
                schoolId: stud?.school_id ?? transaction.school_id ?? null,
                items: [{
                    description: progName ? `${enrollLabel} — ${progName}` : `${enrollLabel} Registration Fee`,
                    program_name: progName || null,
                    enrollment_type: enrollLabel,
                    unit_price: Number(transaction.amount),
                    quantity: 1,
                }],
                metadata: {
                    registration_student_id: studentId,
                    student_name: displayName,
                    source: 'registration_payment',
                },
            });
            if (!settledInvoice.ok) throw new Error(`Failed to create registration invoice: ${settledInvoice.error.message}`);
        }
    } else if (gatewayResponse?.payment_type === 'summer_school_balance') {
        const prospectId = gatewayResponse?.prospect_id;
        if (prospectId) {
            await supabase
                .from('prospective_students')
                .update({ status: 'paid', updated_at: new Date().toISOString() })
                .eq('id', prospectId);

            const { data: existingBalInv } = await supabase
                .from('invoices')
                .select('id')
                .eq('payment_transaction_id', transaction.id)
                .maybeSingle();

            if (!existingBalInv) {
                const { data: prospect } = await supabase
                    .from('prospective_students')
                    .select('full_name, parent_name, parent_email')
                    .eq('id', prospectId)
                    .maybeSingle();

                const displayName = String(prospect?.full_name || gatewayResponse?.student_name || 'Student');
                const rawRef = String(transaction.transaction_reference || transaction.id);
                const invoiceNumber = `INV-BAL-${rawRef.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 48)}`;

                const settledInvoice = await ensureSettledInvoiceForTransaction(supabase as any, {
                    transactionId: transaction.id,
                    invoiceNumber,
                    amount: Number(transaction.amount),
                    currency: transaction.currency || 'NGN',
                    items: [{
                        description: 'AI Summer School 2026 — Remaining Tuition Balance',
                        program_name: 'AI Summer School 2026',
                        student_name: displayName,
                        unit_price: Number(transaction.amount),
                        quantity: 1,
                    }],
                    metadata: {
                        prospect_id: prospectId,
                        student_name: displayName,
                        parent_name: prospect?.parent_name || gatewayResponse?.parent_name || null,
                        parent_email: prospect?.parent_email || gatewayResponse?.parent_email || null,
                        source: 'summer_balance_payment',
                        payment_type: 'summer_school_balance',
                    },
                });
                if (!settledInvoice.ok) throw new Error(`Failed to create summer balance invoice: ${settledInvoice.error.message}`);
            }
        }
    } else if (gatewayResponse?.payment_type === 'summer_school') {
        const prospectId = gatewayResponse?.prospect_id;
        if (prospectId) {
            let authUserId: string | null = null;
            const { data: record } = await supabase
                .from('prospective_students')
                .select('*')
                .eq('id', prospectId)
                .maybeSingle();

            let onboardOk = false;
            if (record) {
                try {
                    const onboard = await onboardSummerStudent(supabase, record as any);
                    authUserId = onboard.student.id;
                    onboardOk = true;
                    gatewayResponse.generated_credentials = { email: onboard.student.email, password: onboard.student.password };
                    void sendSummerCredentials(onboard, record as any);
                } catch (onboardErr) {
                    console.error('[payment] Summer onboarding failed:', onboardErr);
                }
            }

            // CRITICAL: only flip is_active when the student account actually exists.
            // Marking it active on a swallowed onboarding error left "paid + active but
            // no student account" ghosts that the onboarding-sweep cron then skipped
            // (it only retries is_active=false). Keeping it false on failure lets the
            // cron self-heal — the payment status still records the money received.
            await supabase
                .from('prospective_students')
                .update({
                    status: getSummerProspectStatusForPayment({
                        paymentPlan: gatewayResponse?.payment_plan,
                        balanceDue: gatewayResponse?.balance_due,
                    }),
                    is_active: onboardOk,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', prospectId);

            try {
                const { harnessProspectToContactBook } = await import('@/lib/crm/sync-prospect');
                await harnessProspectToContactBook(prospectId, authUserId);
            } catch (syncErr) {
                console.error('Failed to sync approved summer student to CRM contact book:', syncErr);
            }

            const { data: existingSumInv } = await supabase
                .from('invoices')
                .select('id')
                .eq('payment_transaction_id', transaction.id)
                .maybeSingle();

            if (!existingSumInv) {
                const displayName = String(record?.full_name || gatewayResponse?.student_name || 'Student');
                const rawRef = String(transaction.transaction_reference || transaction.id);
                const isInstallment = gatewayResponse?.payment_plan === 'installment';
                const invoiceNumber = `INV-SUM-${rawRef.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 48)}`;
                const balanceDue = Number(gatewayResponse?.balance_due || 0);
                const totalTuition = Number(gatewayResponse?.total_tuition || gatewayResponse?.amount_charged || transaction.amount);

                const description = isInstallment
                    ? `AI Summer School 2026 — Deposit (50% Installment)`
                    : `AI Summer School 2026 — Full Tuition`;

                const settledInvoice = await ensureSettledInvoiceForTransaction(supabase as any, {
                    transactionId: transaction.id,
                    invoiceNumber,
                    amount: Number(transaction.amount),
                    currency: transaction.currency || 'NGN',
                    items: [{
                        description,
                        program_name: 'AI Summer School 2026',
                        student_name: displayName,
                        unit_price: Number(transaction.amount),
                        quantity: 1,
                    }],
                    metadata: {
                        prospect_id: prospectId,
                        student_name: displayName,
                        parent_name: record?.parent_name || gatewayResponse?.parent_name || null,
                        parent_email: record?.parent_email || gatewayResponse?.parent_email || null,
                        source: 'summer_school_payment',
                        payment_type: 'summer_school',
                        payment_plan: isInstallment ? 'installment' : 'full',
                        total_tuition: totalTuition,
                        balance_due: isInstallment ? balanceDue : 0,
                    },
                });
                if (!settledInvoice.ok) throw new Error(`Failed to create summer school invoice: ${settledInvoice.error.message}`);
            }
        }
    } else if (gatewayResponse?.payment_type === 'billing_cycle' && gatewayResponse?.billing_cycle_id) {
        const billingCycleId = gatewayResponse.billing_cycle_id as string;
        const settlement = await settleBillingCyclePayment(supabase as any, {
            billingCycleId, transactionId: transaction.id,
        });
        if (!settlement.ok) throw new Error(settlement.error.message);
    } else if ((transaction as any).invoice_id && validatedInvoice) {
        const invoice = validatedInvoice;
        const { allocatePaymentToInvoice } = await import('@/lib/finance/allocate-payment');
        const alloc = await allocatePaymentToInvoice({
            transactionId: transaction.id,
            invoiceId: invoice.id,
            amount: Number(transaction.amount) || 0,
        });
        if (!alloc.ok) {
            throw new Error(alloc.error.message);
        }

        const settledStatus = alloc.data.invoice_status;
        await syncRosterBillingForInvoice(supabase as any, invoice.id, settledStatus === 'paid' ? 'paid' : 'partially_paid');

        // Keep the linked billing cycle in step when fully paid.
        let cycleId: string | null = invoice.billing_cycle_id ?? null;
        if (!cycleId) {
            const { data: linkedCycle } = await (supabase as any)
                .from('billing_cycles')
                .select('id')
                .eq('invoice_id', invoice.id)
                .maybeSingle();
            cycleId = linkedCycle?.id ?? null;
        }
        if (cycleId && settledStatus === 'paid') {
            const settlement = await settleBillingCyclePayment(supabase as any, {
                billingCycleId: cycleId, transactionId: transaction.id,
            });
            if (!settlement.ok) throw new Error(settlement.error.message);
        }
    }

    // 4. Generate Receipt automatically + notify
    const { paymentsService } = await import('@/services/payments.service');
    const { notificationsService } = await import('@/services/notifications.service');
    const { queueService } = await import('@/services/queue.service');

    try {
        const receiptUrl = await paymentsService.generateReceipt(transaction.id);

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
            actionUrl: '/dashboard/finance?workspace=billing',
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
                    bodyHtml: `<p style="margin:0 0 10px;">${isSummerPayment ? 'A Summer School tuition payment has been confirmed.' : 'A new student registration payment has been confirmed.'}</p>`,
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
                    fromEmail: SMTP_FROM_EMAIL,
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

        if ((isRegistrationPayment || isSummerPayment) && isValidEmail(parentEmail)) {
            const studName = String(gatewayResponse?.student_name || 'Student');
            const parentHtml = buildPaymentConfirmationEmail({
                recipientName: studName,
                amount: Number(transaction.amount),
                currency: String(transaction.currency || 'NGN'),
                reference: String(transaction.transaction_reference),
                description: isSummerPayment
                    ? (gatewayResponse?.payment_type === 'summer_school_balance'
                        ? 'AI Summer School Remaining Balance'
                        : 'AI Summer School Tuition')
                    : 'Student Registration Fee',
                date: new Date().toISOString(),
                portalUrl: receiptUrl,
            });
            await notificationsService.sendExternalEmail({
                to: parentEmail,
                subject: `${isSummerPayment ? 'Payment Confirmed' : 'Registration Confirmed'} — Rillcod Technologies (Ref: ${String(transaction.transaction_reference).slice(0, 12)})`,
                fromName: 'Rillcod Technologies',
                fromEmail: SMTP_FROM_EMAIL,
                html: parentHtml,
            });
        } else if (transaction.portal_user_id) {
            const { data: portalUsers } = await supabase
                .from('portal_users')
                .select('id, email, full_name')
                .eq('id', transaction.portal_user_id)
                .maybeSingle();

            if (portalUsers?.email) {
                let attachments: Array<{ filename: string; content: string }> | undefined;
                if (receiptUrl) {
                    try {
                        const r = await fetch(receiptUrl);
                        if (r.ok) {
                            const buf = Buffer.from(await r.arrayBuffer());
                            const safeName = (portalUsers.full_name || 'Payer').replace(/[^a-z0-9]+/gi, '_');
                            attachments = [{ filename: `Rillcod-Receipt-${safeName}.pdf`, content: buf.toString('base64') }];
                        }
                    } catch { /* non-fatal */ }
                }

                const portalHtml = buildPaymentConfirmationEmail({
                    recipientName: portalUsers.full_name || 'Student',
                    amount: Number(transaction.amount),
                    currency: String(transaction.currency || 'NGN'),
                    reference: String(transaction.transaction_reference),
                    description: 'Platform Fee Payment',
                    date: new Date().toISOString(),
                    portalUrl: receiptUrl,
                });

                const htmlWithLink = receiptUrl
                    ? portalHtml.replace('</td></tr>', `<div style="text-align:center;margin:16px 0;"><a href="${receiptUrl}" style="display:inline-block;padding:9px 20px;background:#10b981;color:#fff;font-size:13px;font-weight:800;text-decoration:none;border-radius:8px;">View / Download Receipt →</a></div></td></tr>`)
                    : portalHtml;

                await notificationsService.sendEmail(portalUsers.id, {
                    to: portalUsers.email,
                    subject: `Payment Receipt — Rillcod Technologies (Ref: ${String(transaction.transaction_reference).slice(0, 12)})`,
                    fromName: 'Rillcod Technologies',
                    fromEmail: SMTP_FROM_EMAIL,
                    html: htmlWithLink,
                    ...(attachments ? { attachments } : {}),
                });
            }
        } else if (transaction.school_id) {
            const { data: invoice } = await (supabase as any)
                .from('invoices')
                .select('id, invoice_number')
                .eq('payment_transaction_id', transaction.id)
                .maybeSingle();
            const { data: billingContact } = await (supabase as any)
                .from('billing_contacts')
                .select('representative_email, representative_name')
                .eq('school_id', transaction.school_id)
                .maybeSingle();
            const { data: schoolUser } = !billingContact?.representative_email
                ? await (supabase as any)
                    .from('portal_users')
                    .select('email, full_name')
                    .eq('school_id', transaction.school_id)
                    .eq('role', 'school')
                    .maybeSingle()
                : { data: null };
            const schoolEmail = billingContact?.representative_email || schoolUser?.email || '';
            if (isValidEmail(schoolEmail)) {
                const contactName = billingContact?.representative_name || schoolUser?.full_name || 'Finance Team';
                const schoolHtml = buildPaymentConfirmationEmail({
                    recipientName: contactName,
                    amount: Number(transaction.amount),
                    currency: String(transaction.currency || 'NGN'),
                    reference: String(transaction.transaction_reference),
                    description: invoice?.invoice_number ? `Invoice ${invoice.invoice_number}` : 'School Billing Payment',
                    date: new Date().toISOString(),
                    portalUrl: receiptUrl,
                });
                await notificationsService.sendExternalEmail({
                    to: schoolEmail,
                    subject: `Payment Confirmed — ${invoice?.invoice_number || 'School Billing'} | Rillcod Technologies`,
                    fromName: 'Rillcod Technologies',
                    fromEmail: SMTP_FROM_EMAIL,
                    html: schoolHtml,
                });
            }
        }
    } catch (err) {
        console.error('Failed to generate automated receipt or notify user:', err);
    }
}
