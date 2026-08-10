import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import {
    summarizePaymentTransactions,
    type PaymentAnalyticsRow,
} from '@/lib/finance/payment-analytics';

const ANALYTICS_PAGE_SIZE = 1000;

async function getHandler(_req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'admin' && ctx.user?.role !== 'school') {
        throw new AppError('Unauthorized', 403, true);
    }

    const supabase = await createClient();
    const transactions: PaymentAnalyticsRow[] = [];
    let offset = 0;

    // PostgREST applies a server row cap when range is omitted. Page the entire
    // authorized scope so finance KPIs never silently become "first 1,000 rows".
    while (true) {
        let query = supabase.from('payment_transactions')
            .select('amount, currency, payment_status, course_id')
            .order('id', { ascending: true })
            .range(offset, offset + ANALYTICS_PAGE_SIZE - 1);

        if (ctx.user?.role === 'school') {
            if (!ctx.user.tenantId) {
                throw new AppError('School account is not linked to a school', 403, true);
            }
            // School totals cover only the school's own settlements. Including
            // family payments would disclose Rillcod's per-pupil collection margin.
            query = query.eq('school_id', ctx.user.tenantId).is('portal_user_id', null);
        }

        const { data, error } = await query;
        if (error) {
            console.error('[payment-analytics] page load failed', { offset, error });
            throw new AppError('Finance analytics are temporarily unavailable', 500, true);
        }
        const page = (data ?? []) as PaymentAnalyticsRow[];
        transactions.push(...page);
        if (page.length < ANALYTICS_PAGE_SIZE) break;
        offset += ANALYTICS_PAGE_SIZE;
    }

    return NextResponse.json({
        success: true,
        data: summarizePaymentTransactions(transactions),
        coverage: { complete: true, records: transactions.length },
    });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler, { requireAuth: true, requireTenant: false })(req, ctx);
