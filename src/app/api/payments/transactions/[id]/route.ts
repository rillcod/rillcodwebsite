import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function requireAdmin() {
    const supabase = await createClient();
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();
    if (error || !user) return null;
    const { data: profile } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') return null;
    return user;
}

/**
 * DELETE /api/payments/transactions/[id]
 * Admin only. Removes abandoned Paystack rows stuck in `pending` (e.g. duplicate link opens).
 * Blocks delete for completed / success transactions.
 */
export async function DELETE(
    _request: Request,
    context: { params: Promise<{ id: string }> },
) {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: 'Transaction id required' }, { status: 400 });

    const db = createAdminClient();
    const { data: row, error: fetchErr } = await db
        .from('payment_transactions')
        .select('id, payment_status')
        .eq('id', id)
        .maybeSingle();

    if (fetchErr || !row) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const st = String(row.payment_status || '').toLowerCase();
    if (st === 'completed' || st === 'success') {
        return NextResponse.json(
            { error: 'Cannot delete a completed transaction. Use refunds or support if this was a mistake.' },
            { status: 400 },
        );
    }
    if (st !== 'pending' && st !== 'processing' && st !== 'failed') {
        return NextResponse.json(
            { error: `Delete is only supported for pending/processing/failed rows (status: ${row.payment_status}).` },
            { status: 400 },
        );
    }

    const { error: delErr } = await db.from('payment_transactions').delete().eq('id', id);
    if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
