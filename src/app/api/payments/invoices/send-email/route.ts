import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { notificationsService } from '@/services/notifications.service';
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

        const itemsHtml = (invoice.items || []).map((item: any) => `
            <tr>
                <td style="padding:10px 14px;border-bottom:1px solid #eee;font-size:13px;">${item.description || ''}</td>
                <td style="padding:10px 14px;border-bottom:1px solid #eee;text-align:right;font-size:13px;font-family:monospace;">${currencySymbol}${Number(item.unit_price ?? 0).toLocaleString()}</td>
            </tr>
        `).join('');

        const html = `
            <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
                <div style="background:${accentColor};padding:24px 28px;">
                    <div style="font-size:20px;font-weight:900;color:#fff;letter-spacing:-0.3px;">Rillcod Technologies</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:2px;">
                        ${isSchoolStream ? 'School Partnerships Division' : 'Digital Learning Platform'}
                    </div>
                </div>
                <div style="padding:28px;">
                    <h2 style="margin:0 0 8px;font-size:18px;color:#111827;">Invoice ${invoice.invoice_number}</h2>
                    <p style="margin:0 0 6px;color:#6b7280;font-size:14px;">Hello ${recipientName},</p>
                    <p style="margin:0 0 20px;color:#374151;font-size:13px;">
                        ${isSchoolStream
                            ? `Please find your school invoice from <strong>Rillcod Technologies</strong> for your review and settlement.`
                            : `You have a new invoice from <strong>Rillcod Technologies</strong>.`}
                    </p>

                    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">
                        <thead>
                            <tr style="background:#f9fafb;">
                                <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #e5e7eb;">Description</th>
                                <th style="padding:10px 14px;text-align:right;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #e5e7eb;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>${itemsHtml}</tbody>
                        <tfoot>
                            <tr style="background:#f9fafb;">
                                <td style="padding:14px;font-weight:900;font-size:14px;color:#111827;">Total Amount Due</td>
                                <td style="padding:14px;text-align:right;font-weight:900;font-size:18px;color:${accentColor};font-family:monospace;">${currencySymbol}${Number(invoice.amount).toLocaleString()}</td>
                            </tr>
                        </tfoot>
                    </table>

                    ${invoice.due_date ? `<p style="margin:0 0 20px;font-size:14px;color:#374151;"><strong>Due Date:</strong> ${new Date(invoice.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>` : ''}

                    <div style="margin-top:24px;padding:20px;background:#f0f4ff;border-radius:8px;border-left:4px solid ${accentColor};">
                        <p style="margin:0 0 12px;color:#1e3a8a;font-size:14px;">
                            ${isSchoolStream
                                ? 'Log in to your Rillcod portal to view the full invoice or contact your account manager.'
                                : 'View and pay this invoice through your Rillcod dashboard.'}
                        </p>
                        <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/finance" style="background:${accentColor};color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;font-weight:700;font-size:13px;display:inline-block;">View Invoice</a>
                    </div>

                    <p style="margin-top:28px;font-size:12px;color:#9ca3af;">
                        Sent by <strong style="color:#374151;">${senderLabel}</strong> via Rillcod Technologies.<br/>
                        Questions? <a href="mailto:${isSchoolStream ? 'partners@rillcod.com' : 'support@rillcod.com'}" style="color:${accentColor};">${isSchoolStream ? 'partners@rillcod.com' : 'support@rillcod.com'}</a>
                    </p>
                </div>
                <div style="padding:14px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;">
                    Invoice Ref: ${invoice.invoice_number} &nbsp;·&nbsp; Rillcod Finance Engine
                </div>
            </div>
        `;

        // ── Send ──────────────────────────────────────────────────────
        await notificationsService.sendEmail(caller?.id || 'system', {
            to: toEmail,
            subject,
            html,
            fromName: `${callerName} via Rillcod (${callerRole || 'Staff'})`,
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
