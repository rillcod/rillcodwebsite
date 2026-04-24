import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Deleter = { role: 'admin' | 'school'; schoolId: string | null };

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
    if (profile.role === 'admin') return { role: 'admin', schoolId: null };
    if (profile.role === 'school' && profile.school_id) return { role: 'school', schoolId: profile.school_id as string };
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

    const db = createAdminClient();
    const { data: row, error: fetchErr } = await db
        .from('payment_transactions')
        .select('id, payment_status, school_id')
        .eq('id', id)
        .maybeSingle();

    if (fetchErr || !row) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    if (caller.role === 'school') {
        const sid = (row as { school_id?: string | null }).school_id;
        if (!sid || sid !== caller.schoolId) {
            return NextResponse.json(
                { error: 'You can only delete payment attempts recorded for your school.' },
                { status: 403 },
            );
        }
    }

    const st = String(row.payment_status || '').toLowerCase().trim();
    const terminal = st === 'completed' || st === 'success' || st === 'refunded';
    if (terminal) {
        return NextResponse.json(
            { error: 'Cannot delete a completed, successful, or refunded transaction.' },
            { status: 400 },
        );
    }

    const { error: delErr } = await db.from('payment_transactions').delete().eq('id', id);
    if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
