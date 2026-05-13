import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { notificationsService } from '@/services/notifications.service';
import { buildInvoiceEmail } from '@/lib/email/rillcod-transactional-email';
import { AppError } from '@/lib/errors';

const ROLE_LABELS: Record<string, string> = {
    admin: 'Admin',
    teacher: 'Teacher',
    school: 'School Admin',
};

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
        const callerRole = ROLE_LABELS[caller?.role] || caller?.role || '';

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
                ),
                billing_contacts (
                    representative_email,
                    representative_name,
                    owner_user_id
                )
            `)
            .eq('id', invoiceId)
            .single();

        if (error || !invoice) {
            return NextResponse.json({ success: false, message: 'Invoice not found' }, { status: 404 });
        }

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

        const senderLabel = `${callerName}${callerRole ? ` · ${callerRole}` : ''}`;

        const lineItems = (invoice.items || []).map((item: any) => ({
            description: String(item.description || 'Service'),
            qty:         item.quantity ? Number(item.quantity) : undefined,
            unitPrice:   Number(item.unit_price ?? item.amount ?? 0),
            currency:    invoice.currency || 'NGN',
        }));

        // Fall back to a single line item using invoice.amount if items array is empty
        if (lineItems.length === 0) {
            lineItems.push({
                description: invoice.description || (isSchoolStream ? 'School Platform Fee' : 'Platform Fee'),
                unitPrice:   Number(invoice.amount),
                currency:    invoice.currency || 'NGN',
            });
        }

        const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/finance`;

        const html = buildInvoiceEmail({
            recipientName: recipientName,
            invoiceNumber: invoice.invoice_number,
            issueDate:     invoice.created_at || new Date().toISOString(),
            dueDate:       invoice.due_date || new Date(Date.now() + 7 * 86400000).toISOString(),
            items:         lineItems,
            currency:      invoice.currency || 'NGN',
            notes:         `Sent by ${senderLabel}. For queries contact ${isSchoolStream ? 'partners@rillcod.com' : 'support@rillcod.com'}.`,
            schoolName:    isSchoolStream ? (invoice.schools?.name || 'Rillcod Technologies') : undefined,
            paymentUrl:    portalUrl,
        });

        // ── Send ──────────────────────────────────────────────────────
        await notificationsService.sendEmail(caller?.id || 'system', {
            to:        toEmail,
            subject,
            html,
            fromName:  `${callerName} via Rillcod Technologies`,
            fromEmail: isSchoolStream ? 'partners@rillcod.com' : 'support@rillcod.com',
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
        }, { status: 500 });
    }
}
