import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit/log';
import { processSuccessfulPayment } from '@/lib/payments/process-successful-payment';

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

        const reference = (transaction as any).transaction_reference as string | null;

        if (status === 'success') {
            // #9 — Audit trail: record WHO approved this payment and WHEN.
            await logAudit(admin as any, {
                action: 'payment_approved',
                actorId: user.id,
                resourceType: 'payment_transaction',
                resourceId: transactionId,
                newValues: {
                    amount: (transaction as any).amount,
                    currency: (transaction as any).currency,
                    reference,
                    payment_method: (transaction as any).payment_method,
                    school_id: (transaction as any).school_id,
                },
            });

            // Delegate to the SAME pipeline the gateway webhook uses, so a manually
            // confirmed bank transfer becomes a fully cohesive record: transaction
            // completed + invoice + summer/registration onboarding + receipt + staff
            // notification. One implementation, zero divergence.
            if (reference) {
                await processSuccessfulPayment(reference, (transaction as any).payment_method || 'manual', null);
            } else {
                // No reference (rare/legacy) — at least mark it completed.
                const { error: updError } = await admin
                    .from('payment_transactions')
                    .update({ payment_status: 'completed', paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                    .eq('id', transactionId);
                if (updError) throw updError;
            }
        } else {
            // Reject / other terminal status — mark only, no side effects.
            const { error: updError } = await admin
                .from('payment_transactions')
                .update({ payment_status: status, paid_at: null, updated_at: new Date().toISOString() })
                .eq('id', transactionId);
            if (updError) throw updError;
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Approval Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
