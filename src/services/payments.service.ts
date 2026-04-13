import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppError } from '@/lib/errors';
import { env } from '@/config/env';
import { paystackInitializeMinorUnits } from '@/lib/payments/paystack-amounts';
import Stripe from 'stripe';
import crypto from 'crypto';

// Dynamically use require for pdfmake so it runs properly
let PdfPrinter: any = null;
try {
    PdfPrinter = require('pdfmake');
} catch (e) { }

const stripe = env.STRIPE_SECRET_KEY
    ? new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' as any })
    : null;

export class PaymentsService {

    // Task 20.1: Create Stripe integration
    async createStripeCheckout(userId: string, courseId: string, amount: number, tenantId?: string) {
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

        try {
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: 'usd',
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

            // Store transaction (Task 20.1)
            await supabase.from('payment_transactions').insert([{
                school_id: tenantId,
                portal_user_id: userId,
                course_id: courseId,
                amount,
                currency: 'USD',
                payment_method: 'stripe',
                payment_status: 'pending',
                transaction_reference: reference,
                external_transaction_id: session.id,
                created_at: new Date().toISOString()
            }]);

            return { url: session.url, reference };
        } catch (err: any) {
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

        try {
            const initBody: Record<string, unknown> = {
                email: userEmail,
                amount: amountMinor,
                reference,
                callback_url: invoiceId
                    ? `${baseUrl}/dashboard/payments?payment=success&ref=${reference}`
                    : `${baseUrl}/courses/${courseId}?payment=success`,
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

            await supabase.from('payment_transactions').insert([{
                school_id: tenantId,
                portal_user_id: userId,
                course_id: courseId || null,
                invoice_id: invoiceId || null,
                amount: totalAmount,
                currency: payCurrency,
                payment_method: 'paystack',
                payment_status: 'pending',
                transaction_reference: reference,
                external_transaction_id: paystackData.data.reference,
                created_at: new Date().toISOString(),
            }]);

            return { url: paystackData.data.authorization_url, reference };
        } catch (err: any) {
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

    // Task 23.1: Receipt Generation
    async generateReceipt(transactionId: string) {
        if (!PdfPrinter) {
            throw new AppError('pdfmake not installed or failed to load', 500);
        }

        const supabase = createAdminClient();
        const { data: transaction } = await (supabase as any)
            .from('payment_transactions')
            .select('*, courses(title), invoices(invoice_number), portal_users(full_name, email), schools(name)')
            .eq('id', transactionId)
            .single();

        if (!transaction || transaction.payment_status !== 'completed') {
            throw new AppError('Valid transaction not found for receipt', 400);
        }

        // Setup PDF formatting using pdfmake
        const fonts = {
            Roboto: {
                normal: 'Helvetica',
                bold: 'Helvetica-Bold',
                italics: 'Helvetica-Oblique',
                bolditalics: 'Helvetica-BoldOblique'
            }
        };

        const printer = new PdfPrinter(fonts);
        const schools = transaction.schools as any;
        const courses = transaction.courses as any;
        const portalUsers = transaction.portal_users as any;
        const invoices = (transaction as any).invoices as any;

        const docDefinition = {
            content: [
                {
                    columns: [
                        {
                            stack: [
                                { text: 'RILLCOD TECHNOLOGIES', style: 'brand' },
                                { text: 'STEM & Coding Education', style: 'tagline' },
                                { text: '12, Digital Learning Hub, Benin City, Edo State, Nigeria', style: 'address' },
                                { text: 'RC: 1892341 | www.rillcod.com', style: 'address' },
                            ]
                        },
                        {
                            stack: [
                                { text: 'OFFICIAL RECEIPT', style: 'header', alignment: 'right' },
                                { text: `REF: ${transaction.transaction_reference}`, alignment: 'right', style: 'ref' },
                                { text: `Date: ${new Date(transaction.paid_at || transaction.created_at || '').toLocaleDateString()}`, alignment: 'right', style: 'date' },
                            ]
                        }
                    ]
                },
                { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1, strokeColor: '#eeeeee' }], margin: [0, 20] },
                {
                    columns: [
                        {
                            stack: [
                                { text: 'BILL TO:', style: 'label' },
                                { text: portalUsers?.full_name || 'Valued Student', style: 'studentName' },
                                { text: portalUsers?.email || 'N/A', style: 'studentEmail' },
                                { text: schools?.name || 'Private Enrollment', style: 'schoolName' },
                            ]
                        },
                        {
                            stack: [
                                { text: 'PAYMENT DETAILS:', style: 'label', alignment: 'right' },
                                { text: `Method: ${(transaction.payment_method || 'gateway').toUpperCase()}`, alignment: 'right' },
                                { text: `Status: ${(transaction.payment_status || 'Paid').toUpperCase()}`, alignment: 'right', color: '#10b981' },
                            ]
                        }
                    ]
                },
                { text: '\n\n' },
                {
                    table: {
                        headerRows: 1,
                        widths: ['*', 'auto', 'auto'],
                        body: [
                            [
                                { text: 'DESCRIPTION', style: 'tableHeader' },
                                { text: 'QTY', style: 'tableHeader', alignment: 'center' },
                                { text: 'TOTAL', style: 'tableHeader', alignment: 'right' }
                            ],
                            [
                                { text: invoices?.invoice_number ? `Payment for Invoice #${invoices.invoice_number}` : (courses?.title || 'Academic Enrollment Fee'), margin: [0, 10] },
                                { text: '1', alignment: 'center', margin: [0, 10] },
                                { text: `${transaction.currency} ${transaction.amount.toLocaleString()}`, alignment: 'right', margin: [0, 10], bold: true }
                            ]
                        ]
                    },
                    layout: 'lightHorizontalLines'
                },
                { text: '\n' },
                {
                    columns: [
                        { text: '', width: '*' },
                        {
                            width: 'auto',
                            stack: [
                                {
                                    columns: [
                                        { text: 'TOTAL PAID', bold: true, fontSize: 14, width: 100 },
                                        { text: `${transaction.currency} ${transaction.amount.toLocaleString()}`, bold: true, fontSize: 14, alignment: 'right', width: 100 }
                                    ]
                                }
                            ]
                        }
                    ]
                },
                { text: '\n\n\n' },
                { text: 'This is a system-generated receipt and requires no physical signature.', style: 'footer', alignment: 'center' },
                { text: 'Thank you for choosing Rillcod Technologies!', style: 'footer', alignment: 'center', italic: true }
            ],
            styles: {
                brand: { fontSize: 18, bold: true, color: '#4f46e5' },
                tagline: { fontSize: 8, bold: true, color: '#94a3b8', margin: [0, 0, 0, 5] },
                address: { fontSize: 9, color: '#64748b' },
                header: { fontSize: 24, bold: true, color: '#1e293b' },
                ref: { fontSize: 10, color: '#64748b', margin: [0, 5, 0, 0] },
                date: { fontSize: 10, color: '#64748b' },
                label: { fontSize: 8, bold: true, color: '#94a3b8', margin: [0, 0, 0, 5] },
                studentName: { fontSize: 12, bold: true },
                studentEmail: { fontSize: 10, color: '#64748b' },
                schoolName: { fontSize: 10, italic: true, color: '#64748b' },
                tableHeader: { fontSize: 10, bold: true, color: '#475569', margin: [0, 5, 0, 5] },
                footer: { fontSize: 9, color: '#94a3b8' }
            }
        };

        const pdfDoc = printer.createPdfKitDocument(docDefinition);

        let chunks: any[] = [];
        pdfDoc.on('data', (chunk: any) => chunks.push(chunk));

        return new Promise<string>((resolve, reject) => {
            pdfDoc.on('end', async () => {
                const buffer = Buffer.concat(chunks);

                // Upload buffer to Supabase file storage securely
                const storagePath = `receipts/${transaction.id}.pdf`;
                const { error: uploadError } = await supabase.storage
                    .from('lms-files')
                    .upload(storagePath, buffer, {
                        contentType: 'application/pdf',
                        upsert: true
                    });

                if (uploadError) reject(uploadError);

                const { data: publicData } = supabase.storage.from('lms-files').getPublicUrl(storagePath);

                await supabase.from('payment_transactions')
                    .update({ 
                        receipt_url: publicData.publicUrl 
                    } as any)
                    .eq('id', transaction.id);

                // Create record in the formal receipts table
                await (supabase as any).from('receipts').insert({
                    transaction_id: transaction.id,
                    student_id: transaction.portal_user_id,
                    school_id: transaction.school_id,
                    amount: transaction.amount,
                    currency: transaction.currency,
                    pdf_url: publicData.publicUrl,
                    metadata: { generated_at: new Date().toISOString() }
                });

                resolve(publicData.publicUrl);
            });
            pdfDoc.end();
        });
    }

}

export const paymentsService = new PaymentsService();
