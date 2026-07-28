import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';

async function getHandler(_req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'school') {
        throw new AppError('Unauthorized', 403, true);
    }

    const supabase = await createClient();
    let query = supabase.from('payment_transactions')
        .select('id, amount, currency, payment_status, course_id, school_id');
    if (ctx.user?.role === 'school') {
        if (!ctx.user.tenantId) throw new AppError('School account is not linked to a school', 403, true);
        // Totals must cover the school's OWN settlements only. Including family
        // payments would let a school add up what Rillcod collected from its parents
        // and derive the per-pupil price — the margin over what the school is billed.
        query = query.eq('school_id', ctx.user.tenantId).is('portal_user_id', null);
    }

    const { data: transactions, error } = await query;
    if (error) throw new AppError('Failed to fetch analytics: ' + error.message, 500);

    let successCount = 0;
    let failureCount = 0;
    let pendingCount = 0;
    let refundedCount = 0;
    const grossByCurrency: Record<string, number> = {};
    const refundedByCurrency: Record<string, number> = {};
    const netByCurrency: Record<string, number> = {};
    const revenueByCourse: Record<string, Record<string, number>> = {};

    for (const transaction of transactions ?? []) {
        const status = String(transaction.payment_status || '').toLowerCase();
        const currency = String(transaction.currency || 'NGN').toUpperCase();
        const amount = Number(transaction.amount) || 0;
        if (['completed', 'success', 'paid'].includes(status)) {
            successCount += 1;
            grossByCurrency[currency] = (grossByCurrency[currency] || 0) + amount;
            if (transaction.course_id) {
                revenueByCourse[transaction.course_id] ||= {};
                revenueByCourse[transaction.course_id][currency] = (revenueByCourse[transaction.course_id][currency] || 0) + amount;
            }
        } else if (status === 'refunded') {
            refundedCount += 1;
            refundedByCurrency[currency] = (refundedByCurrency[currency] || 0) + amount;
        } else if (status === 'failed') {
            failureCount += 1;
        } else if (['pending', 'processing', 'submitted'].includes(status)) {
            pendingCount += 1;
        }
    }

    for (const currency of new Set([...Object.keys(grossByCurrency), ...Object.keys(refundedByCurrency)])) {
        netByCurrency[currency] = (grossByCurrency[currency] || 0) - (refundedByCurrency[currency] || 0);
    }

    const completedAttempts = successCount + failureCount;
    const successRate = completedAttempts > 0 ? (successCount / completedAttempts) * 100 : 0;
    return NextResponse.json({
        success: true,
        data: {
            // Legacy KPI remains NGN, but is now net of completed refunds.
            totalRevenue: netByCurrency.NGN || 0,
            grossRevenue: grossByCurrency.NGN || 0,
            refundedAmount: refundedByCurrency.NGN || 0,
            netRevenueByCurrency: netByCurrency,
            grossRevenueByCurrency: grossByCurrency,
            refundedByCurrency,
            successRate: Math.round(successRate * 100) / 100,
            metrics: { successCount, failureCount, pendingCount, refundedCount },
            revenueByCourse,
        },
    });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler, { requireAuth: true, requireTenant: false })(req, ctx);