import { createClient } from '@/lib/supabase/server';
import { AppError } from '@/lib/errors';
import { env } from '@/config/env';
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

    // Task 20.2: Create Paystack integration
    async createPaystackCheckout(userId: string, userEmail: string, courseId: string, amount: number, tenantId?: string) {
        if (!env.PAYSTACK_SECRET_KEY) {
            throw new AppError('Paystack configuration missing', 500);
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

        const reference = `PYS-${Date.now()}-${userId.substring(0, 5)}`;
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

        try {
            const response = await fetch('https://api.paystack.co/transaction/initialize', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: userEmail,
                    amount: Math.round(amount * 100), // Paystack uses kobo
                    reference,
                    callback_url: `${baseUrl}/courses/${courseId}?payment=success`,
                    metadata: {
                        userId,
                        courseId,
                        tenantId: tenantId || '',
                    }
                })
            });

            const paystackData = await response.json();

            if (!paystackData.status) {
                throw new Error(paystackData.message);
            }

            // Store transaction (Task 20.2)
            await supabase.from('payment_transactions').insert([{
                school_id: tenantId,
                portal_user_id: userId,
                course_id: courseId,
                amount,
                currency: 'NGN',
                payment_method: 'paystack',
                payment_status: 'pending',
                transaction_reference: reference,
                external_transaction_id: paystackData.data.reference,
                created_at: new Date().toISOString()
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

        const supabase = await createClient();
        const { data: transaction } = await supabase
            .from('payment_transactions')
            .select('*, courses(title), portal_users(full_name, email), schools(name)')
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

        const docDefinition = {
            content: [
                { text: schools?.name || 'Rillcod Academy', style: 'header' },
                { text: `Receipt for ${courses?.title || 'Course'}`, style: 'subheader' },
                '\n',
                `Transaction Ref: ${transaction.transaction_reference}`,
                `Date: ${new Date(transaction.paid_at || transaction.created_at || '').toLocaleDateString()}`,
                `Amount: ${transaction.currency} ${transaction.amount}`,
                '\n',
                `Student: ${portalUsers?.full_name || 'N/A'}`,
                `Email: ${portalUsers?.email || 'N/A'}`,
                '\n\n',
                `Payment Method: ${(transaction.payment_method || 'unknown').toUpperCase()}`,
            ],
            styles: {
                header: { fontSize: 22, bold: true },
                subheader: { fontSize: 16, bold: true, margin: [0, 10, 0, 5] as any }
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
                    .update({ payment_gateway_response: { receipt_url: publicData.publicUrl } } as any)
                    .eq('id', transaction.id);

                resolve(publicData.publicUrl);
            });
            pdfDoc.end();
        });
    }

}

export const paymentsService = new PaymentsService();
