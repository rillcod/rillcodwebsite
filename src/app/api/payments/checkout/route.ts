import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { withApiProxy, type ApiContext } from '@/lib/api-wrapper';
import { paymentsService } from '@/services/payments.service';
import { withValidation } from '@/proxies/validation.proxy';
import { AppError } from '@/lib/errors';
import { canRoleInitiateCheckout } from '@/lib/payments/checkout-access';

const createCheckoutSchema = z.object({
    course_id:      z.string().uuid('Invalid course ID').optional(),
    invoice_id:     z.string().uuid('Invalid invoice ID').optional(),
    // Fix 6: amount is now OPTIONAL — server resolves it from the linked record.
    // Clients may still send it as a hint but it will be IGNORED in favour of DB value.
    amount:         z.number().positive().optional(),
    currency:       z.string().default('NGN'),
    payment_method: z.enum(['stripe', 'paystack']).default('paystack'),
}).refine(data => data.course_id || data.invoice_id, {
    message: 'Either course_id or invoice_id must be provided',
});

type InvoiceRow = {
    id: string;
    portal_user_id: string | null;
    school_id: string | null;
    amount: number;
    currency: string | null;
    status: string | null;
};

/** Only the debtor (student), their parent, owning school, or admin may pay an invoice. */
async function assertUserCanPayInvoice(
    supabase: SupabaseClient<Database>,
    ctx: ApiContext,
    inv: InvoiceRow,
) {
    const me = ctx.user;
    if (!me?.id) throw new AppError('Unauthorized', 401, true);

    const role = me.role;
    if (role === 'admin') return;

    if (role === 'student') {
        if (inv.portal_user_id !== me.id) {
            throw new AppError('You cannot pay this invoice', 403, true);
        }
        return;
    }

    if (role === 'parent') {
        const { data: profile } = await supabase
            .from('portal_users')
            .select('email')
            .eq('id', me.id)
            .single();
        if (!profile?.email) throw new AppError('Profile email required', 400, true);
        const { data: children } = await supabase
            .from('students')
            .select('user_id')
            .eq('parent_email', profile.email);
        const childIds = (children ?? []).map((c) => c.user_id).filter(Boolean) as string[];
        if (!inv.portal_user_id || !childIds.includes(inv.portal_user_id)) {
            throw new AppError('You cannot pay this invoice', 403, true);
        }
        return;
    }

    if (role === 'school') {
        const tenant = me.tenantId;
        if (!tenant || inv.school_id !== tenant) {
            throw new AppError('You cannot pay this invoice', 403, true);
        }
        return;
    }

    throw new AppError('You cannot pay this invoice', 403, true);
}

async function postHandler(req: Request, ctx: ApiContext) {
    // Fix 5: allow parents to pay invoices
    if (!canRoleInitiateCheckout(ctx.user?.role)) {
        throw new AppError(
            `Role '${ctx.user?.role}' is not permitted to initiate checkout`,
            403,
            true,
        );
    }

    const user = ctx.user!;
    const { data, errorResponse } = await withValidation(req as any, createCheckoutSchema);
    if (errorResponse) return errorResponse;

    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();

    // ─── Fix 6: always resolve amount server-side ────────────────────────────
    let resolvedAmount: number;
    let resolvedCurrency: string = data!.currency;

    if (data!.invoice_id) {
        const { data: inv, error: invErr } = await supabase
            .from('invoices')
            .select('id, amount, currency, status, portal_user_id, school_id')
            .eq('id', data!.invoice_id)
            .single();

        if (invErr || !inv) throw new AppError('Invoice not found', 404);
        if (inv.status === 'paid') throw new AppError('This invoice has already been paid', 400);
        if (inv.status === 'cancelled') throw new AppError('This invoice is cancelled', 400);

        await assertUserCanPayInvoice(supabase, ctx, inv as InvoiceRow);

        resolvedAmount   = Number(inv.amount);
        resolvedCurrency = (inv.currency || resolvedCurrency).toUpperCase();
        if (resolvedCurrency !== 'NGN' && resolvedCurrency !== 'USD') {
            throw new AppError('Unsupported currency for Paystack checkout. Use NGN or USD.', 400, true);
        }

    } else if (data!.course_id) {
        const { data: course, error: courseErr } = await supabase
            .from('courses')
            .select('program_id')
            .eq('id', data!.course_id)
            .single();

        if (courseErr || !course) throw new AppError('Course not found', 404);

        let programPrice: number | null = null;
        if (course.program_id) {
            const { data: prog } = await supabase
                .from('programs')
                .select('price, default_currency')
                .eq('id', course.program_id)
                .maybeSingle();
            if (prog?.price != null && Number(prog.price) > 0) {
                programPrice = Number(prog.price);
                resolvedCurrency = (prog.default_currency || 'NGN').toUpperCase();
            }
        }

        if (programPrice != null && programPrice > 0) {
            resolvedAmount = programPrice;
            if (resolvedCurrency !== 'NGN' && resolvedCurrency !== 'USD') {
                throw new AppError('Unsupported programme currency for Paystack checkout. Set programs.default_currency to NGN or USD.', 400, true);
            }
        } else {
            throw new AppError(
                'This course has no programme price configured. Checkout amounts cannot be supplied by the client.',
                400,
                true,
            );
        }
    } else {
        throw new AppError('Either course_id or invoice_id must be provided', 400);
    }

    if (resolvedAmount <= 0) throw new AppError('Amount must be greater than zero', 400);
    // ─────────────────────────────────────────────────────────────────────────

    const { data: userData } = await supabase
        .from('portal_users')
        .select('email')
        .eq('id', user.id)
        .single();

    let checkoutResult;

    if (data!.payment_method === 'stripe') {
        if (!data!.course_id) throw new AppError('Stripe checkout currently only supports courses', 400);
        checkoutResult = await paymentsService.createStripeCheckout(
            user.id,
            data!.course_id,
            resolvedAmount,
            user.tenantId,
        );
    } else {
        checkoutResult = await paymentsService.createPaystackCheckout(
            user.id,
            userData?.email || 'user@example.com',
            resolvedAmount,
            {
                courseId:   data!.course_id,
                invoiceId:  data!.invoice_id,
                tenantId:   user.tenantId,
                currency:   resolvedCurrency,
            },
        );
    }

    return NextResponse.json({ success: true, data: checkoutResult });
}

export const POST = (req: any, ctx: any) =>
    withApiProxy(postHandler, { requireAuth: true, requireTenant: false })(req, ctx);
