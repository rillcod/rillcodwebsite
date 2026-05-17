import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { notificationsService } from '@/services/notifications.service';
import { buildInvoiceEmail } from '@/lib/email/rillcod-transactional-email';
import { AppError } from '@/lib/errors';
import { env } from '@/config/env';


export async function POST(req: Request) {
    try {
        const supabase = await createClient();

        // ── Identify the staff member sending this email ──────────────
        const { data: { user } } = await supabase.auth.getUser();
        const { data: caller } = user
            ? await (supabase as any)
                .from('portal_users')
                .select('id, full_name, role')
                .eq('id', user.id)
                .single()
            : { data: null };

        const callerName = caller?.full_name || 'Rillcod Staff';

        const { invoiceId, recipientEmail } = await req.json();

        if (!invoiceId) {
            return NextResponse.json({ success: false, message: 'Invoice ID is required' }, { status: 400 });
        }

        // ── Fetch invoice with all related data ───────────────────────
        const { data: invoice, error } = await (supabase as any)
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
            const { data } = await (supabase as any).from('billing_contacts').select('*').eq('school_id', invoice.school_id).maybeSingle();
            billingContact = data;
        } else if (invoice.portal_user_id) {
            const { data } = await (supabase as any).from('billing_contacts').select('*').eq('owner_user_id', invoice.portal_user_id).maybeSingle();
            billingContact = data;
        }
        invoice.billing_contacts = billingContact;

        const isSchoolStream = invoice.stream === 'school' || (invoice.school_id && !invoice.portal_user_id);
        const portalUser = invoice.portal_users;

        // ── Resolve TO address ────────────────────────────────────────
        let resolvedEmail: string | undefined;

        if (isSchoolStream) {
            // School: billing contact → school portal user (role='school')
            resolvedEmail = invoice.billing_contacts?.representative_email || undefined;
            if (!resolvedEmail && invoice.school_id) {
                const { data: schoolUser } = await (supabase as any)
                    .from('portal_users')
                    .select('email')
                    .eq('school_id', invoice.school_id)
                    .eq('role', 'school')
                    .maybeSingle();
                resolvedEmail = schoolUser?.email || undefined;
            }
        } else {
            // Individual: student email → parent email fallback
            resolvedEmail = portalUser?.email || undefined;
            if (!resolvedEmail && invoice.portal_user_id) {
                // Check if there's a linked parent email via the students table
                const { data: studentRow } = await (supabase as any)
                    .from('students')
                    .select('parent_email')
                    .eq('user_id', invoice.portal_user_id)
                    .maybeSingle();
                resolvedEmail = studentRow?.parent_email || undefined;
            }
        }

        const toEmail: string | undefined = recipientEmail?.trim() || resolvedEmail;

        if (!toEmail) {
            return NextResponse.json(
                {
                    success: false,
                    message: isSchoolStream
                        ? 'No school contact email found — please enter a recipient email address'
                        : 'No email address found for this student or parent',
                },
                { status: 400 },
            );
        }

        const recipientName = isSchoolStream
            ? (invoice.schools?.name || 'Partner School')
            : (portalUser?.full_name || 'Client');

        const currencySymbol = invoice.currency === 'NGN' ? '₦' : (invoice.currency || '₦');
        const accentColor = isSchoolStream ? '#4338ca' : '#2563eb';

        const subject = isSchoolStream
            ? `Invoice ${invoice.invoice_number} — Rillcod Technologies (School Billing)`
            : `Invoice ${invoice.invoice_number} from Rillcod Technologies`;

        const lineItems = (invoice.items || []).map((item: any) => ({
            description: String(item.description || 'Service'),
            qty: item.quantity ? Number(item.quantity) : undefined,
            unitPrice: Number(item.unit_price ?? item.amount ?? 0),
            currency: invoice.currency || 'NGN',
        }));

        // Fall back to a single line item using invoice.amount if items array is empty
        if (lineItems.length === 0) {
            lineItems.push({
                description: invoice.description || (isSchoolStream ? 'School Platform Fee' : 'Platform Fee'),
                unitPrice: Number(invoice.amount),
                currency: invoice.currency || 'NGN',
            });
        }

        // ── Generate Paystack payment link ────────────────────────────
        const appBase = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
        const fallbackUrl = isSchoolStream
            ? `${appBase}/dashboard/finance`
            : `${appBase}/dashboard/parent-invoices`;

        let paystackUrl: string = fallbackUrl;

        if (env.PAYSTACK_SECRET_KEY && invoice.amount > 0) {
            try {
                const reference = `EMAIL-INV-${invoice.invoice_number}-${Date.now()}`;
                const callbackUrl = isSchoolStream
                    ? `${appBase}/dashboard/finance`
                    : `${appBase}/dashboard/parent-invoices?paid=1&invoice=${invoiceId}`;

                const psRes = await fetch('https://api.paystack.co/transaction/initialize', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        email: toEmail,
                        amount: Math.round(Number(invoice.amount) * 100), // kobo
                        reference,
                        currency: invoice.currency ?? 'NGN',
                        callback_url: callbackUrl,
                        metadata: {
                            invoice_id: invoiceId,
                            invoice_number: invoice.invoice_number,
                            cancel_action: callbackUrl,
                        },
                    }),
                });

                const psData = await psRes.json();
                if (psData.status && psData.data?.authorization_url) {
                    paystackUrl = psData.data.authorization_url;

                    // Record the pending transaction for webhook reconciliation
                    await (supabase as any).from('payment_transactions').insert({
                        portal_user_id: invoice.portal_user_id ?? caller?.id ?? null,
                        school_id: invoice.school_id ?? null,
                        amount: invoice.amount,
                        currency: invoice.currency ?? 'NGN',
                        payment_method: 'paystack',
                        payment_status: 'pending',
                        transaction_reference: reference,
                        invoice_id: invoiceId,
                        payment_gateway_response: {
                            payment_type: 'invoice_email',
                            invoice_id: invoiceId,
                            sent_to: toEmail,
                        },
                    });
                }
            } catch (psErr) {
                // Non-fatal — fall back to portal URL
                console.warn('Paystack init failed for invoice email, using portal URL:', psErr);
            }
        }

        // ── Fetch bank accounts for transfer details ──────────────────
        const { data: bankAccounts } = await (supabase as any)
            .from('payment_accounts')
            .select('label, bank_name, account_number, account_name, payment_note')
            .eq('is_active', true)
            .or(invoice.school_id ? `school_id.eq.${invoice.school_id},owner_type.eq.global` : 'owner_type.eq.global')
            .limit(3);

        const html = buildInvoiceEmail({
            recipientName: recipientName,
            invoiceNumber: invoice.invoice_number,
            issueDate: invoice.created_at || new Date().toISOString(),
            dueDate: invoice.due_date || new Date(Date.now() + 7 * 86400000).toISOString(),
            items: lineItems,
            currency: invoice.currency || 'NGN',
            isSchool: isSchoolStream,
            schoolName: isSchoolStream ? (invoice.schools?.name || 'Rillcod Technologies') : undefined,
            bankAccounts: bankAccounts ?? [],
            paymentUrl: paystackUrl,
        });

        // ── Send ──────────────────────────────────────────────────────
        await notificationsService.sendEmail(caller?.id || 'system', {
            to: toEmail,
            subject,
            html,
            fromName: `${callerName} via Rillcod Technologies`,
            replyTo: isSchoolStream ? 'partners@rillcod.com' : 'support@rillcod.com',
        });

        // ── Post-send housekeeping ────────────────────────────────────

        // Mark draft invoices as sent
        if (invoice.status === 'draft') {
            await (supabase as any)
                .from('invoices')
                .update({ status: 'sent' })
                .eq('id', invoiceId);
        }

        // School invoices: save/update billing contact so recipient email pre-fills next time
        if (isSchoolStream && invoice.school_id && toEmail) {
            const existing = invoice.billing_contacts;
            if (!existing) {
                await (supabase as any)
                    .from('billing_contacts')
                    .insert({
                        school_id: invoice.school_id,
                        owner_type: 'school',
                        representative_email: toEmail,
                        representative_name: invoice.schools?.name || null,
                        owner_user_id: caller?.id || null,
                    });
            } else if (!existing.representative_email) {
                await (supabase as any)
                    .from('billing_contacts')
                    .update({ representative_email: toEmail })
                    .eq('school_id', invoice.school_id);
            }
        }

        return NextResponse.json({ success: true, message: `Email sent to ${toEmail}` });
    } catch (err: any) {
        console.error('Send invoice email error:', err);
        return NextResponse.json({
            success: false,
            message: err instanceof AppError ? err.message : 'Failed to send invoice email',
            detail: err?.message,
        }, { status: 500 });
    }
}
