import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';

async function getHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Transaction ID missing', 400);

    const supabase = await createClient();

    // If the user is a student, ensure they only fetch their own transactions
    let query = supabase
        .from('payment_transactions')
        .select('*, courses(title, program_id)')
        .eq('id', id);

    if (ctx.user?.role === 'student') {
        query = query.eq('portal_user_id', ctx.user.id);
    }

    if (ctx.user?.tenantId) {
        query = query.eq('school_id', ctx.user.tenantId);
    }

    const { data, error } = await query.single();

    if (error || !data) {
        throw new AppError('Transaction not found or access denied', 404);
    }

    return NextResponse.json({
        success: true,
        data
    });
}

// Admins/Schools/Teachers could conceivably fetch any relevant transaction
export const GET = (req: any, ctx: any) => withApiProxy(getHandler, { requireAuth: true, requireTenant: false })(req, ctx);
