import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { paymentsService } from '@/services/payments.service';
import { withValidation } from '@/proxies/validation.proxy';
import { AppError } from '@/lib/errors';

const createCheckoutSchema = z.object({
    course_id: z.string().uuid("Invalid course ID").optional(),
    invoice_id: z.string().uuid("Invalid invoice ID").optional(),
    amount: z.number().positive(),
    currency: z.string().default('NGN'),
    payment_method: z.enum(['stripe', 'paystack']).default('paystack'),
}).refine(data => data.course_id || data.invoice_id, {
    message: "Either course_id or invoice_id must be provided"
});

async function postHandler(req: Request, ctx: ApiContext) {
    if (ctx.user?.role !== 'student' && ctx.user?.role !== 'school') {
        throw new AppError('Only students or schools can initiate checkout', 403, true);
    }

    const { data, errorResponse } = await withValidation(req as any, createCheckoutSchema);
    if (errorResponse) return errorResponse;

    let checkoutResult;

    if (data!.payment_method === 'stripe') {
        if (!data!.course_id) throw new AppError('Stripe checkout currently only supports courses', 400);
        checkoutResult = await paymentsService.createStripeCheckout(
            ctx.user.id,
            data!.course_id,
            data!.amount,
            ctx.user?.tenantId
        );
    } else {
        const { createClient } = await import('@/lib/supabase/server');
        const supabase = await createClient();
        const { data: userData } = await supabase.from('portal_users').select('email').eq('id', ctx.user.id).single();

        checkoutResult = await paymentsService.createPaystackCheckout(
            ctx.user.id,
            userData?.email || 'user@example.com',
            data!.amount,
            {
                courseId: data!.course_id,
                invoiceId: data!.invoice_id,
                tenantId: ctx.user?.tenantId
            }
        );
    }

    return NextResponse.json({
        success: true,
        data: checkoutResult
    });
}

export const POST = (req: any, ctx: any) => withApiProxy(postHandler, { requireAuth: true, requireTenant: false })(req, ctx);
