import { NextResponse } from 'next/server';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { redactTransactionForRole } from '@/lib/finance/redact-invoice';

async function getHandler(req: Request, ctx: ApiContext) {
    const id = ctx.params?.id;
    if (!id) throw new AppError('Transaction ID missing', 400);

    const supabase = await createClient();
    const role = ctx.user?.role;

    // If the user is a student, ensure they only fetch their own transactions
    let query = supabase
        .from('payment_transactions')
        .select('*, courses(title, program_id)')
        .eq('id', id);

    if (role === 'student' || role === 'parent') {
        query = query.eq('portal_user_id', ctx.user!.id);
    } else if (role === 'school' || role === 'teacher') {
        if (!ctx.user?.tenantId) {
            throw new AppError('Transaction not found or access denied', 404);
        }
        query = query.eq('school_id', ctx.user.tenantId);
    } else if (role !== 'admin') {
        throw new AppError('Transaction not found or access denied', 404);
    }

    const { data, error } = await query.single();

    if (error || !data) {
        throw new AppError('Transaction not found or access denied', 404);
    }
    const visible = redactTransactionForRole(data, role);
    if (!visible) {
        throw new AppError('Transaction not found or access denied', 404);
    }


    return NextResponse.json({
        success: true,
        data: visible
    });
}

export const GET = (req: any, ctx: any) => withApiProxy(getHandler, {
    requireAuth: true, requireTenant: false, roles: ['admin', 'school', 'teacher', 'student', 'parent'],
})(req, ctx);
