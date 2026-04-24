import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';

async function getHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'school') {
        throw new AppError('Unauthorized', 403, true);
    }

    const supabase = await createClient();

    // Limit queries to the tenant's data if they are a school admin
    let query = supabase.from('payment_transactions').select('*');

    if (ctx.user?.tenantId) {
        query = query.eq('school_id', ctx.user.tenantId);
    }

    const { data: transactions, error } = await query;
    if (error) {
        throw new AppError('Failed to fetch analytics', 500);
    }

    // Calculate generic revenue statistics
    let totalRevenue = 0;
    let successCount = 0;
    let failureCount = 0;
    let refundedCount = 0;

    const revenueByCourse: Record<string, number> = {};

    transactions.forEach(tx => {
        if (tx.payment_status === 'completed') {
            totalRevenue += tx.amount;
            successCount++;

            if (tx.course_id) {
                if (!revenueByCourse[tx.course_id]) {
                    revenueByCourse[tx.course_id] = 0;
                }
                revenueByCourse[tx.course_id] += tx.amount;
            }

        } else if (tx.payment_status === 'failed') {
            failureCount++;
        } else if (tx.payment_status === 'refunded') {
            refundedCount++;
        }
    });

    const totalAttempted = successCount + failureCount + refundedCount;
    const successRate = totalAttempted > 0 ? (successCount / totalAttempted) * 100 : 0;

    return NextResponse.json({
        success: true,
        data: {
            totalRevenue,
            successRate: Math.round(successRate * 100) / 100,
            metrics: {
                successCount,
                failureCount,
                refundedCount
            },
            revenueByCourse
        }
    });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler, { requireAuth: true, requireTenant: false })(req, ctx);
