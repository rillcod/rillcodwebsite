import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { paymentsService } from '@/services/payments.service';
import { AppError } from '@/lib/errors';

export async function POST(req: Request) {
    try {
        const supabase = await createClient();
        
        // 1. Check Auth & Admin Role
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: profile } = await supabase
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
        const { data: transaction, error: txError } = await supabase
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
        const { error: updError } = await supabase
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
            await (supabase as any)
                .from('invoices')
                .update({ 
                    status: 'paid',
                    payment_transaction_id: transactionId,
                    updated_at: new Date().toISOString()
                })
                .eq('id', (transaction as any).invoice_id);
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
