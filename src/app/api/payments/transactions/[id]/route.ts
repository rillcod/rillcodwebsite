import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { voidPaymentAttempt } from '@/lib/finance/void-payment';
import { financeResultToResponse } from '@/lib/finance/write-result';

type Deleter = { id: string; role: 'admin' | 'school'; schoolId: string | null };

async function requireDeleter(): Promise<Deleter | null> {
    const supabase = await createClient();
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();
    if (error || !user) return null;
    const { data: profile } = await supabase
        .from('portal_users')
        .select('role, school_id')
        .eq('id', user.id)
        .single();
    if (!profile) return null;
    if (profile.role === 'admin') return { id: user.id, role: 'admin', schoolId: null };
    if (profile.role === 'school' && profile.school_id) return { id: user.id, role: 'school', schoolId: profile.school_id as string };
    return null;
}

/**
 * DELETE /api/payments/transactions/[id]
 * Admin (any row) or school (only rows for that school). Removes non-terminal payment rows.
 */
export async function DELETE(
    _request: Request,
    context: { params: Promise<{ id: string }> },
) {
    const caller = await requireDeleter();
    if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: 'Transaction id required' }, { status: 400 });

    const result = await voidPaymentAttempt(createAdminClient() as any, {
        transactionId: id,
        actorId: caller.id,
        reason: 'Removed from transaction ledger by finance user',
        schoolId: caller.role === 'school' ? caller.schoolId : null,
    });
    if (!result.ok) {
        const mapped = financeResultToResponse(result);
        return NextResponse.json(mapped.body, { status: mapped.status });
    }
    return NextResponse.json({ success: true, action: 'voided', data: result.data, effects: result.effects });
}
