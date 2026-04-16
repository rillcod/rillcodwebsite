import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { paymentsService } from '@/services/payments.service';

export async function POST(req: Request) {
    try {
        const supabase = await createClient();
        const admin = createAdminClient();
        
        // 1. Check Auth & Admin Role
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await admin
            .from('portal_users')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profile?.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden: Admin access only' }, { status: 403 });
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

        // 5. Generate Receipt
        if (status === 'success') {
            try {
                await paymentsService.generateReceipt(transactionId);
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
