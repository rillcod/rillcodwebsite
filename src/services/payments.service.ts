import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { env } from '@/config/env';
import { paystackInitializeMinorUnits } from '@/lib/payments/paystack-amounts';
import { createPendingPayment, removePendingPayment } from '@/lib/payments/pending-transaction';
import Stripe from 'stripe';

const stripe = env.STRIPE_SECRET_KEY
    ? new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' as any })
    : null;

export class PaymentsService {

    // Task 20.1: Create Stripe integration
    async createStripeCheckout(
        userId: string,
        courseId: string,
        amount: number,
        tenantId?: string,
        currency: string = 'USD',
    ) {
        if (!stripe) {
            throw new AppError('Stripe configuration missing', 500);
        }

        const supabase = await createClient();

        // Verify course
        const { data: course, error: courseErr } = await supabase
            .from('courses')
            .select('title, school_id')
            .eq('id', courseId)
            .single();

        if (courseErr || !course || (tenantId && course.school_id !== tenantId)) {
            throw new AppError('Course not found or access denied', 404);
        }

        // Generate unique reference
        const reference = `STR-${Date.now()}-${userId.substring(0, 5)}`;
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const normalizedCurrency = currency.trim().toLowerCase();
        const pending = await createPendingPayment(supabase as any, {
            schoolId: tenantId || course.school_id || null,
            portalUserId: userId,
            courseId,
            amount,
            currency: normalizedCurrency,
            method: 'stripe',
            reference,
            metadata: { payment_type: 'course', course_id: courseId },
        });
        if (!pending.ok) throw new AppError(pending.error.message, pending.error.code === 'validation' ? 400 : 500);
        const pendingId = String((pending.data as any).id);

        try {
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: normalizedCurrency,
                            product_data: {
                                name: `Enrollment: ${course.title}`,
                            },
                            unit_amount: Math.round(amount * 100), // Stripe uses cents
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                success_url: `${baseUrl}/courses/${courseId}?payment=success`,
                cancel_url: `${baseUrl}/courses/${courseId}?payment=cancelled`,
                client_reference_id: reference,
                metadata: {
                    userId,
                    courseId,
                    tenantId: tenantId || '',
                },
            });

            const { error: sessionLinkError } = await supabase.from('payment_transactions')
                .update({ external_transaction_id: session.id, updated_at: new Date().toISOString() })
                .eq('id', pendingId)
                .eq('payment_status', 'pending');
            if (sessionLinkError) throw new Error(`Could not link Stripe session: ${sessionLinkError.message}`);

            return { url: session.url, reference };
        } catch (err: any) {
            await removePendingPayment(supabase as any, pendingId);
            throw new AppError(`Stripe checkout failed: ${err.message}`, 500);
        }
    }

    // Helper to calculate total to charge so recipient gets exactly `target` after Paystack fees & withdrawal buffer
    // Based on Paystack Nigeria rates: 1.5% + ₦100 (waived for < ₦2500, capped at ₦2000)
    // Plus a 0.1% extra commission as requested (Total 1.6%)
    // Plus a small ₦50 buffer for the withdrawal/stamp duty fee mentioned by user
    calculatePaystackTotal(target: number): number {
        const targetWithBuffer = target + 50; 
        const rate = 0.016; // 1.6% total
        const divisor = 1 - rate; // 0.984
        
        let total = 0;
        if (targetWithBuffer < 2500 * divisor) {
            total = targetWithBuffer / divisor;
        } else if (targetWithBuffer < 125000) { // 2000 / 0.016 = 125000
            total = (targetWithBuffer + 100) / divisor;
        } else {
            total = targetWithBuffer + 2000;
        }
        return Math.ceil(total);
    }

    // Task 20.2: Create Paystack integration
    async createPaystackCheckout(
        userId: string,
        userEmail: string,
        amount: number,
        options: {
            courseId?: string;
            invoiceId?: string;
            tenantId?: string;
            /** Major-unit currency (NGN or USD); must match Paystack dashboard capabilities. */
            currency?: string;
        },
    ) {
        if (!env.PAYSTACK_SECRET_KEY) {
            throw new AppError('Paystack configuration missing', 500);
        }

        const { courseId, invoiceId, tenantId, currency: currencyOpt } = options;
        const supabase = await createClient();

        let payCurrency: 'NGN' | 'USD';
        let amountMinor: number;
        let totalAmount: number;
        try {
            const minor = paystackInitializeMinorUnits(amount, currencyOpt, (net) => this.calculatePaystackTotal(net));
            payCurrency = minor.currency;
            amountMinor = minor.amountMinor;
            totalAmount =
                payCurrency === 'NGN'
                    ? this.calculatePaystackTotal(amount)
                    : Math.round(amount * 100) / 100;
        } catch (e: any) {
            throw new AppError(e?.message || 'Invalid currency for Paystack', 400, true);
        }

        const reference = `PYS-${Date.now()}-${userId.substring(0, 5)}`;
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const pending = await createPendingPayment(supabase as any, {
            schoolId: tenantId || null,
            portalUserId: userId,
            courseId: courseId || null,
            invoiceId: invoiceId || null,
            amount,
            currency: payCurrency,
            method: 'paystack',
            reference,
            metadata: {
                checkout: { gross_charged: totalAmount, gateway_fees: Math.max(0, totalAmount - amount), currency: payCurrency },
                ...(invoiceId ? { payment_type: 'invoice_payment', invoice_id: invoiceId } : { payment_type: 'course', course_id: courseId || null }),
            },
        });
        if (!pending.ok) throw new AppError(pending.error.message, pending.error.code === 'validation' ? 400 : 500);
        const pendingId = String((pending.data as any).id);

        try {
            const initBody: Record<string, unknown> = {
                email: userEmail,
                amount: amountMinor,
                reference,
                callback_url: invoiceId
                    ? `${baseUrl}/dashboard/money?payment=success&ref=${reference}`
                    : `${baseUrl}/courses/${courseId}?payment=success`,
                cancel_action: invoiceId
                    ? `${baseUrl}/dashboard/money?payment=cancelled&ref=${reference}`
                    : `${baseUrl}/courses/${courseId}?payment=cancelled`,
                metadata: {
                    userId,
                    courseId,
                    invoiceId,
                    tenantId: tenantId || '',
                    originalAmount: amount,
                    paystackFees: totalAmount - amount,
                    currency: payCurrency,
                },
            };
            if (payCurrency !== 'NGN') {
                initBody.currency = payCurrency;
            }

            const response = await fetch('https://api.paystack.co/transaction/initialize', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(initBody),
            });

            const paystackData = await response.json();

            if (!paystackData.status) {
                throw new Error(paystackData.message);
            }

            const { error: gatewayLinkError } = await supabase.from('payment_transactions')
                .update({ external_transaction_id: paystackData.data.reference, updated_at: new Date().toISOString() })
                .eq('id', pendingId)
                .eq('payment_status', 'pending');
            if (gatewayLinkError) throw new Error(`Could not link Paystack checkout: ${gatewayLinkError.message}`);

            return { url: paystackData.data.authorization_url, reference };
        } catch (err: any) {
            await removePendingPayment(supabase as any, pendingId);
            throw new AppError(`Paystack checkout failed: ${err.message}`, 500);
        }
    }

    // Task 21.1: Create Subscription service
    async createSubscription(userId: string, planId: string, tenantId?: string) {
        // Mock of subscription generation
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const reference = `SUB-${Date.now()}-${userId.substring(0, 5)}`;
        return { url: `${baseUrl}/subscribe?ref=${reference}`, reference };
    }

    // Task 22.1: Refund processing
    async processRefund(transactionId: string, reason?: string) {
        const supabase = await createClient();

        const { data: transaction, error } = await supabase
            .from('payment_transactions')
            .select('*')
            .eq('id', transactionId)
            .single();

        if (error || !transaction || transaction.payment_status !== 'completed') {
            throw new AppError('Valid completed transaction not found', 400);
        }

        // Invoke gateway APIs... (mocked)
        // if (transaction.payment_method === 'stripe') { await stripe.refunds.create({ charge: ... }) }

        const existingResponse = (transaction.payment_gateway_response && typeof transaction.payment_gateway_response === 'object' && !Array.isArray(transaction.payment_gateway_response))
            ? transaction.payment_gateway_response as Record<string, unknown>
            : {};

        await supabase.from('payment_transactions').update({
            payment_status: 'refunded',
            updated_at: new Date().toISOString(),
            payment_gateway_response: { ...existingResponse, refund_reason: reason }
        }).eq('id', transactionId);

        // Revoke Immediate Access (Task 22.1)
        // Let's assume courses are within programs, we need to find the program and suspend enrollment
        if (transaction.course_id) {
            const { data: course } = await supabase.from('courses').select('program_id').eq('id', transaction.course_id).single();

            if (course?.program_id && transaction.portal_user_id) {
                await supabase.from('enrollments').update({
                    status: 'suspended'
                }).eq('user_id', transaction.portal_user_id)
                    .eq('program_id', course.program_id);
            }
        }

        return true;
    }

    /**
     * Task 23.1 — Receipt Generation (legacy entry point).
     *
     * All new code paths should import `issueReceiptForTransaction`
     * from `@/lib/finance/issue` directly. This wrapper is kept so
     * older callers (webhook, approve, receipt route) still work and
     * to preserve the original signature `(transactionId) => url`.
     *
     * The new issuer:
     *   • Detects SCHOOL vs INDIVIDUAL stream from the invoice.
     *   • Renders the correct branded PDF (two templates).
     *   • Writes stream-specific receipt numbers (REC-SCH / REC-).
     *   • Stores the PDF under receipts/{stream}/{id}.pdf.
     */
    async generateReceipt(transactionId: string): Promise<string> {
        const { issueReceiptForTransaction } = await import('@/lib/finance/issue');
        const res = await issueReceiptForTransaction(transactionId);
        return res.url;
    }

}

export const paymentsService = new PaymentsService();
