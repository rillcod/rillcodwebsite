import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { notificationsService } from '@/services/notifications.service';
import { buildInvoiceIssueEmail, defaultInvoicePaymentUrl } from '@/lib/finance/invoice-email';
import { AppError } from '@/lib/errors';
import { env } from '@/config/env';
import { createPendingPayment, removePendingPayment } from '@/lib/payments/pending-transaction';
import { SMTP_FROM_EMAIL } from '@/config/brand';
import { roleHasCapability } from '@/lib/auth/capabilities';
import { loadInvoicePaymentAccounts } from '@/lib/finance/invoice-payment-accounts';
import { invoiceOutstandingAmount } from '@/lib/finance/invoice-state';
import {
    buildSmartFinanceWhatsAppText,
    buildWhatsAppShareHref,
    isDeliverableExternalEmail,
} from '@/lib/finance/smart-communication';
import { sendWhatsAppDetailed } from '@/lib/whatsapp/send';


export async function POST(req: Request) {
    try {
        const supabase = await createClient();
        const db = createAdminClient();
        const warnings: string[] = [];

        // ── Identify the staff member sending this email ──────────────
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }
        const { data: caller } = await (db as any)
            .from('portal_users')
            .select('id, full_name, role, school_id')
            .eq('id', user.id)
            .single();

        // Sending invoices (with payment links) is a staff-only action.
        if (!caller || !roleHasCapability(caller.role, 'manage_finance')) {
            return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
        }

        const callerName = caller?.full_name || 'Rillcod Staff';

        const {
            invoiceId,
            recipientEmail,
            recipientPhone,
            customNote,
            sendWhatsApp,
        } = await req.json();

        if (!invoiceId) {
            return NextResponse.json({ success: false, message: 'Invoice ID is required' }, { status: 400 });
        }

        // ── Fetch invoice with all related data ───────────────────────
        const { data: invoice, error } = await (db as any)
            .from('invoices')
            .select(`
                *,
                portal_users (
                    id,
                    email,
                    full_name,
                    role
                ),
                schools (
                    name
                )
            `)
            .eq('id', invoiceId)
            .single();

        if (error || !invoice) {
            console.error('Invoice fetch error:', error);
            return NextResponse.json({
                success: false,
                message: error ? `Supabase error: ${error.message || error.details}` : 'Invoice not found in DB'
            }, { status: 404 });
        }


        let billingContact = null;
        if (invoice.school_id) {
            const { data } = await (db as any).from('billing_contacts').select('*').eq('school_id', invoice.school_id).maybeSingle();
            billingContact = data;
        } else if (invoice.portal_user_id) {
            const { data } = await (db as any).from('billing_contacts').select('*').eq('owner_user_id', invoice.portal_user_id).maybeSingle();
            billingContact = data;
        }
        invoice.billing_contacts = billingContact;

        const isSchoolStream = invoice.stream === 'school' || (invoice.school_id && !invoice.portal_user_id);
        const portalUser = invoice.portal_users;

        // ── Resolve TO address & WhatsApp ─────────────────────────────
        let resolvedEmail: string | undefined;
        let resolvedPhone: string | undefined = billingContact?.representative_whatsapp || undefined;
        let studentRow: { parent_email?: string | null; parent_phone?: string | null; parent_name?: string | null; phone?: string | null } | null = null;

        if (isSchoolStream) {
            if (isDeliverableExternalEmail(invoice.billing_contacts?.representative_email)) {
                resolvedEmail = invoice.billing_contacts.representative_email.trim();
            }
            if (!resolvedEmail && invoice.school_id) {
                const { data: schoolUser } = await (db as any)
                    .from('portal_users')
                    .select('email, phone')
                    .eq('school_id', invoice.school_id)
                    .eq('role', 'school')
                    .maybeSingle();
                if (isDeliverableExternalEmail(schoolUser?.email)) {
                    resolvedEmail = schoolUser.email.trim();
                }
                if (!resolvedPhone && schoolUser?.phone) resolvedPhone = schoolUser.phone;
            }
        } else {
            if (isDeliverableExternalEmail(invoice.billing_contacts?.representative_email)) {
                resolvedEmail = invoice.billing_contacts.representative_email.trim();
            }
            if (invoice.portal_user_id) {
                const { data: stu } = await (db as any)
                    .from('students')
                    .select('parent_email, parent_phone, parent_name, phone')
                    .eq('user_id', invoice.portal_user_id)
                    .maybeSingle();
                studentRow = stu;
            }
            if (!resolvedEmail && isDeliverableExternalEmail(studentRow?.parent_email)) {
                resolvedEmail = studentRow!.parent_email!.trim();
            }
            if (!resolvedEmail && isDeliverableExternalEmail(portalUser?.email)) {
                resolvedEmail = portalUser.email.trim();
            }
            if (!resolvedPhone) {
                resolvedPhone = studentRow?.parent_phone || studentRow?.phone || undefined;
            }
        }

        const toEmail: string | undefined = recipientEmail?.trim() || resolvedEmail;
        const toPhone: string | undefined = recipientPhone?.trim() || resolvedPhone;

        if (!toEmail) {
            return NextResponse.json(
                {
                    success: false,
                    message: isSchoolStream
                        ? 'No school contact email found — please enter a recipient email address'
                        : 'No deliverable parent/student email found — please enter a recipient email address',
                },
                { status: 400 },
            );
        }

        const recipientName = isSchoolStream
            ? (billingContact?.representative_name || invoice.schools?.name || 'Partner School')
            : (studentRow?.parent_name || portalUser?.full_name || 'Client');

        const chargeAmount = invoiceOutstandingAmount(invoice);

        const appBase = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
        let paystackUrl: string = defaultInvoicePaymentUrl({
            isSchool: isSchoolStream,
            invoiceId,
            appUrl: appBase,
        });

        if (env.PAYSTACK_SECRET_KEY && chargeAmount > 0) {
            const reference = `EMAIL-INV-${invoice.invoice_number}-${Date.now()}`;
            const pending = await createPendingPayment(db as any, {
                portalUserId: invoice.portal_user_id ?? caller?.id ?? null,
                schoolId: invoice.school_id ?? null,
                amount: chargeAmount,
                currency: invoice.currency ?? 'NGN',
                method: 'paystack',
                reference,
                invoiceId,
                metadata: { payment_type: 'invoice_email', invoice_id: invoiceId, sent_to: toEmail },
            });

            if (!pending.ok) {
                warnings.push('Online payment link was omitted because its pending ledger record could not be saved.');
            } else {
                const pendingId = String((pending.data as any).id);
                try {
                    const callbackUrl = isSchoolStream
                        ? `${appBase}/dashboard/school-billing?payment=success`
                        : `${appBase}/dashboard/parent-invoices?payment=success&invoice=${invoiceId}`;
                    const cancelUrl = isSchoolStream
                        ? `${appBase}/dashboard/school-billing?payment=cancelled`
                        : `${appBase}/dashboard/parent-invoices?payment=cancelled&invoice=${invoiceId}`;
                    const psRes = await fetch('https://api.paystack.co/transaction/initialize', {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email: toEmail,
                            amount: Math.round(Number(chargeAmount) * 100),
                            reference,
                            currency: invoice.currency ?? 'NGN',
                            callback_url: callbackUrl,
                            cancel_action: cancelUrl,
                            metadata: { invoice_id: invoiceId, invoice_number: invoice.invoice_number, transaction_id: pendingId },
                        }),
                    });
                    const psData = await psRes.json();
                    if (psData.status && psData.data?.authorization_url) {
                        paystackUrl = psData.data.authorization_url;
                    } else {
                        await removePendingPayment(db as any, pendingId);
                        warnings.push('Online checkout could not be started; the portal payment link was used instead.');
                    }
                } catch (psErr) {
                    await removePendingPayment(db as any, pendingId);
                    console.warn('Paystack init failed for invoice email, using portal URL:', psErr);
                }
            }
        }

        // Fetch bank accounts for transfer details ──────────────────
        let bankAccounts;
        try {
            bankAccounts = await loadInvoicePaymentAccounts(db as any, invoice, 3);
        } catch (accountError) {
            return NextResponse.json({
                success: false,
                message: accountError instanceof Error ? accountError.message : 'Payment instructions could not be loaded',
            }, { status: 409 });
        }

        const { html, subject } = buildInvoiceIssueEmail(invoice, {
            recipientName,
            isSchool: isSchoolStream,
            paymentUrl: paystackUrl,
            bankAccounts,
            appUrl: appBase,
            customNote: typeof customNote === 'string' ? customNote : undefined,
        });

        // ── Send ──────────────────────────────────────────────────────
        await notificationsService.sendEmail(caller?.id || 'system', {
            to: toEmail,
            subject,
            html,
            fromName: `${callerName} via Rillcod Technologies`,
            fromEmail: SMTP_FROM_EMAIL,
            replyTo: SMTP_FROM_EMAIL,
        });

        const termLabel =
            typeof invoice.metadata?.term_label === 'string'
                ? invoice.metadata.term_label
                : invoice.metadata?.term && invoice.metadata?.academic_year
                    ? `${invoice.metadata.term} ${invoice.metadata.academic_year}`
                    : null;

        const waText = buildSmartFinanceWhatsAppText({
            mode: 'invoice',
            recipientName,
            invoiceNumber: invoice.invoice_number || invoiceId.slice(0, 8).toUpperCase(),
            currency: invoice.currency || 'NGN',
            totalAmount: Number(invoice.original_amount ?? invoice.amount ?? 0),
            amountPaid: Number(invoice.amount_paid ?? 0),
            remainingAmount: chargeAmount,
            dueDate: invoice.due_date,
            termLabel,
            bankAccount: bankAccounts?.[0] ?? null,
            paymentUrl: paystackUrl,
            customNote: typeof customNote === 'string' ? customNote : null,
        });
        const whatsappShareUrl = buildWhatsAppShareHref(toPhone, waText);

        let whatsappDelivered = false;
        if (sendWhatsApp && toPhone) {
            try {
                const waRes = await sendWhatsAppDetailed({
                    to: toPhone,
                    message: waText,
                    sourceType: 'invoice_issue',
                    sourceId: invoiceId,
                    schoolId: invoice.school_id ?? null,
                    recipientUserId: invoice.portal_user_id ?? null,
                });
                whatsappDelivered = Boolean(waRes?.success);
                if (!waRes?.success) {
                    warnings.push('WhatsApp Cloud API is not active for this number — use the 1-click WhatsApp link to send directly.');
                }
            } catch {
                warnings.push('WhatsApp Cloud API could not deliver automatically — use the 1-click WhatsApp link.');
            }
        }

        // ── Post-send housekeeping ────────────────────────────────────

        // Mark draft invoices as sent
        if (invoice.status === 'draft') {
            const { error: sentStateError } = await (db as any)
                .from('invoices')
                .update({ status: 'sent' })
                .eq('id', invoiceId);
            if (sentStateError) warnings.push('Email sent, but invoice status could not be changed from draft to sent.');
        }

        // Save/update billing contact so recipient email & WhatsApp pre-fill next time
        if (isSchoolStream && invoice.school_id && (toEmail || toPhone)) {
            const existing = invoice.billing_contacts;
            const patch: Record<string, any> = {};
            if (toEmail && toEmail !== existing?.representative_email) patch.representative_email = toEmail;
            if (toPhone && toPhone !== existing?.representative_whatsapp) patch.representative_whatsapp = toPhone;

            if (!existing) {
                const { error: contactInsertError } = await (db as any)
                    .from('billing_contacts')
                    .insert({
                        school_id: invoice.school_id,
                        owner_type: 'school',
                        representative_email: toEmail || null,
                        representative_whatsapp: toPhone || null,
                        representative_name: invoice.schools?.name || null,
                        owner_user_id: caller?.id || null,
                    });
                if (contactInsertError) warnings.push('Email sent, but the billing contact could not be saved.');
            } else if (Object.keys(patch).length > 0) {
                const { error: contactUpdateError } = await (db as any)
                    .from('billing_contacts')
                    .update(patch)
                    .eq('school_id', invoice.school_id);
                if (contactUpdateError) warnings.push('Email sent, but the billing contact could not be updated.');
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Email sent to ' + toEmail,
            sent_to: toEmail,
            whatsappShareUrl,
            whatsappDelivered,
            effects: ['invoice_email_sent'],
            ...(warnings.length ? { warnings } : {}),
        });
    } catch (err: any) {
        console.error('Send invoice email error:', err);
        return NextResponse.json({
            success: false,
            message: err instanceof AppError ? err.message : 'Failed to send invoice email',
            detail: err?.message,
        }, { status: 500 });
    }
}
