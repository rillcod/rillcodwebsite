import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { notificationsService } from '@/services/notifications.service';
import { AppError } from '@/lib/errors';

export async function POST(req: Request) {
    try {
        const supabase = await createClient();
        const { invoiceId } = await req.json();

        if (!invoiceId) {
            return NextResponse.json({ success: false, message: 'Invoice ID is required' }, { status: 400 });
        }

        // Fetch invoice details with student and school info
        const { data: invoice, error } = await (supabase as any)
            .from('invoices')
            .select(`
                *,
                portal_users (
                    id,
                    email,
                    full_name
                ),
                schools (
                    name
                )
            `)
            .eq('id', invoiceId)
            .single();

        if (error || !invoice) {
            return NextResponse.json({ success: false, message: 'Invoice not found' }, { status: 404 });
        }

        const student = invoice.portal_users;
        if (!student?.email) {
            return NextResponse.json({ success: false, message: 'Student email not found' }, { status: 400 });
        }

        // Prepare email content
        const subject = `Invoice from ${invoice.schools?.name || 'Rillcod Technologies'} - ${invoice.invoice_number}`;
        const currencySymbol = invoice.currency === 'NGN' ? '₦' : invoice.currency;
        
        const html = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #111827;">Invoice ${invoice.invoice_number}</h2>
                <p>Hello ${student.full_name},</p>
                <p>You have a new invoice from <strong>${invoice.schools?.name || 'Rillcod Technologies'}</strong>.</p>
                
                <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
                    <tr style="background: #f9fafb;">
                        <th style="padding: 10px; text-align: left; border-bottom: 1px solid #eee;">Description</th>
                        <th style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">Amount</th>
                    </tr>
                    ${(invoice.items || []).map((item: any) => `
                        <tr>
                            <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.description}</td>
                            <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">${currencySymbol}${item.unit_price.toLocaleString()}</td>
                        </tr>
                    `).join('')}
                    <tr>
                        <td style="padding: 10px; font-weight: bold;">Total</td>
                        <td style="padding: 10px; text-align: right; font-weight: bold; font-size: 1.2em;">${currencySymbol}${invoice.amount.toLocaleString()}</td>
                    </tr>
                </table>

                <p><strong>Due Date:</strong> ${new Date(invoice.due_date).toLocaleDateString()}</p>
                
                <div style="margin-top: 30px; padding: 20px; background: #eff6ff; border-radius: 8px; text-align: center;">
                    <p style="margin: 0 0 15px 0; color: #1e40af;">You can pay this invoice online through your dashboard.</p>
                    <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/payments" style="background: #2563eb; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">View & Pay Invoice</a>
                </div>
                
                <p style="margin-top: 30px; font-size: 0.9em; color: #6b7280;">
                    If you have any questions, please contact the accounts department at ${invoice.schools?.name || 'Rillcod Technologies'}.
                </p>
            </div>
        `;

        await notificationsService.sendEmail(student.id, {
            to: student.email,
            subject,
            html,
            fromName: 'Rillcod Technologies',
            fromEmail: 'support@rillcod.com',
        });

        // Update status to 'sent' if it was 'draft'
        if (invoice.status === 'draft') {
            await (supabase as any)
                .from('invoices')
                .update({ status: 'sent' })
                .eq('id', invoiceId);
        }

        return NextResponse.json({ success: true, message: 'Email sent successfully' });
    } catch (err: any) {
        console.error('Send invoice email error:', err);
        return NextResponse.json({ 
            success: false, 
            message: err instanceof AppError ? err.message : 'Failed to send invoice email' 
        }, { status: 500 });
    }
}
