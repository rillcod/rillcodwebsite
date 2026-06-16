import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { paymentsService } from '@/services/payments.service';
import { queueService } from '@/services/queue.service';

export async function POST(req: Request) {
    try {
        const supabase = await createClient();
        const admin = createAdminClient();
        
        // 1. Check Auth & Admin Role
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await admin
            .from('portal_users')
            .select('role, school_id')
            .eq('id', user.id)
            .single();

        const canApprove = profile?.role === 'admin' ||
            profile?.role === 'school' ||
            profile?.role === 'teacher';
        if (!canApprove) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { transactionId, status = 'success' } = await req.json();
        if (!transactionId) return NextResponse.json({ error: 'Transaction ID required' }, { status: 400 });

        // 2. Get the transaction
        const { data: transaction, error: txError } = await admin
            .from('payment_transactions')
            .select('*')
            .eq('id', transactionId)
            .single();

        if (txError || !transaction) {
            return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
        }

        // Non-admin: only approve transactions belonging to their school
        if (profile?.role !== 'admin' && profile?.school_id && transaction.school_id !== profile.school_id) {
            return NextResponse.json({ error: 'Forbidden: transaction belongs to a different school' }, { status: 403 });
        }

        if (transaction.payment_status === 'completed') {
            return NextResponse.json({ success: true, message: 'Already completed' });
        }

        // 3. Update Transaction
        const { error: updError } = await admin
            .from('payment_transactions')
            .update({
                payment_status: status === 'success' ? 'completed' : status,
                paid_at: status === 'success' ? new Date().toISOString() : null,
                updated_at: new Date().toISOString()
            })
            .eq('id', transactionId);

        if (updError) throw updError;

        // 4. Update Invoice if linked
        if ((transaction as any).invoice_id && status === 'success') {
            await (admin as any)
                .from('invoices')
                .update({ 
                    status: 'paid',
                    payment_transaction_id: transactionId,
                    updated_at: new Date().toISOString()
                })
                .eq('id', (transaction as any).invoice_id);
        }

        // 4b. Billing cycle (e.g. bank transfer) — mirror webhook behaviour
        const gw =
            transaction.payment_gateway_response &&
            typeof transaction.payment_gateway_response === 'object' &&
            !Array.isArray(transaction.payment_gateway_response)
                ? (transaction.payment_gateway_response as Record<string, unknown>)
                : {};
        if (status === 'success' && gw.payment_type === 'billing_cycle' && gw.billing_cycle_id) {
            const db = createAdminClient();
            const billingCycleId = String(gw.billing_cycle_id);
            const { data: cycle } = await (db as any)
                .from('billing_cycles')
                .select('id, sticky_notice_id')
                .eq('id', billingCycleId)
                .maybeSingle();

            await (db as any)
                .from('billing_cycles')
                .update({
                    status: 'paid',
                    updated_at: new Date().toISOString(),
                })
                .eq('id', billingCycleId)
                .neq('status', 'paid');

            if (cycle?.sticky_notice_id) {
                await (db as any)
                    .from('billing_notices')
                    .update({
                        is_resolved: true,
                        resolved_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', cycle.sticky_notice_id);
            }
        }

        // 5. Generate Receipt + email it to the payer
        if (status === 'success') {
            try {
                await paymentsService.generateReceipt(transactionId);

                if (transaction.portal_user_id) {
                    const { data: payer } = await admin
                        .from('portal_users')
                        .select('full_name, email')
                        .eq('id', transaction.portal_user_id)
                        .single();

                    if (payer?.email) {
                        void (async () => {
                            try {
                                const { notificationsService } = await import('@/services/notifications.service');
                                const { buildReceiptHTML } = await import('@/lib/finance/templates/html/receipt-html');
                                const docRef = (transaction as any).transaction_reference || transactionId.slice(0, 8).toUpperCase();
                                const now = new Date();
                                const dateStr = now.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });
                                const paidStr = (transaction as any).paid_at
                                    ? new Date((transaction as any).paid_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
                                    : dateStr;
                                const amt = Number((transaction as any).amount) || 0;
                                const methodLabels: Record<string, string> = {
                                    bank_transfer: 'Bank Transfer', cash: 'Cash', pos: 'POS Terminal',
                                    cheque: 'Cheque', online: 'Online Payment', paystack: 'Online Payment (Paystack)',
                                };
                                const html = buildReceiptHTML({
                                    docRef,
                                    dateStr,
                                    payDateStr: paidStr,
                                    payerLabel: payer.full_name || payer.email,
                                    payerType: 'student',
                                    paymentMethod: (transaction as any).payment_method || 'online',
                                    receivedBy: 'Rillcod Technologies',
                                    items: [{ description: 'Academic Enrolment / Tuition Fee', quantity: 1, unit_price: amt }],
                                    totalAmount: amt,
                                    payToAcc: null,
                                    notes: `Reference: ${docRef}. Thank you for your payment. Keep this receipt for your records.`,
                                });
                                await notificationsService.sendExternalEmail({
                                    to: payer.email,
                                    subject: `Payment Receipt — ₦${amt.toLocaleString('en-NG')} | Rillcod Technologies`,
                                    html,
                                    fromName: 'Rillcod Technologies',
                                    fromEmail: 'support@rillcod.com',
                                });
                            } catch (emailErr) {
                                console.error('Receipt email failed:', emailErr);
                            }
                        })();
                    } else {
                        // Fallback: in-app notification if no email
                        await queueService.queueNotification(transaction.portal_user_id, 'email', {
                            subject: 'Payment Successful',
                            body: `Your payment of ${(transaction as any).amount} ${(transaction as any).currency} has been received. Your receipt is available in your Rillcod dashboard.`,
                        });
                    }
                }
            } catch (err) {
                console.error('Manual approval receipt failed:', err);
            }
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Approval Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
