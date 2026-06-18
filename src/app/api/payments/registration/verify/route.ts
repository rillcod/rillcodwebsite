import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/config/env';
import { isCompletedPaymentStatus } from '@/lib/registration/payment-state';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(req: Request) {
  try {
    const reference = new URL(req.url).searchParams.get('reference')?.trim();
    if (!reference) {
      return NextResponse.json({ error: 'Payment reference is required' }, { status: 400 });
    }

    if (!env.PAYSTACK_SECRET_KEY) {
      return NextResponse.json({ error: 'Payment gateway is not configured' }, { status: 500 });
    }

    const supabase = adminClient();
    const { data: tx } = await supabase
      .from('payment_transactions')
      .select('id, amount, currency, invoice_id, payment_status, payment_gateway_response, transaction_reference')
      .eq('transaction_reference', reference)
      .maybeSingle();

    if (!tx) {
      return NextResponse.json({ error: 'Unknown payment reference' }, { status: 404 });
    }

    const gateway = (tx.payment_gateway_response ?? {}) as Record<string, unknown>;
    if (gateway.payment_type !== 'registration') {
      return NextResponse.json({ error: 'Invalid registration payment reference' }, { status: 400 });
    }

    const studentId = gateway.student_id as string | undefined;
    if (!studentId) {
      return NextResponse.json({ error: 'Payment is not linked to a student registration' }, { status: 400 });
    }

    if (!isCompletedPaymentStatus(tx.payment_status)) {
      const paystackRes = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` } },
      );
      const paystackData = await paystackRes.json();
      const verified = paystackData.status === true && paystackData?.data?.status === 'success';

      if (!verified) {
        return NextResponse.json({
          ok: false,
          status: paystackData?.data?.status ?? 'unknown',
          reference,
        });
      }

      await supabase
        .from('payment_transactions')
        .update({
          payment_status: 'completed',
          paid_at: new Date().toISOString(),
          payment_gateway_response: {
            ...gateway,
            paystack: paystackData.data,
          },
        })
        .eq('id', tx.id)
        .neq('payment_status', 'completed');
    }

    await supabase
      .from('students')
      .update({
        status: 'pending',
        registration_payment_at: new Date().toISOString(),
        registration_paystack_reference: reference,
        updated_at: new Date().toISOString(),
      })
      .eq('id', studentId)
      .eq('status', 'pending');

    if (!tx.invoice_id) {
      const { data: student } = await supabase
        .from('students')
        .select('school_id, enrollment_type, full_name, name')
        .eq('id', studentId)
        .maybeSingle();

      const { data: existingInv } = await supabase
        .from('invoices')
        .select('id')
        .eq('payment_transaction_id', tx.id)
        .maybeSingle();

      if (!existingInv) {
        const enrollLabel = String(gateway.enrollment_type || student?.enrollment_type || 'Registration');
        const progName = gateway.program_name ? String(gateway.program_name) : '';
        const displayName = String(student?.full_name || student?.name || gateway.student_name || 'Student');
        const rawRef = String(tx.transaction_reference || tx.id);
        const invoiceNumber = `INV-REG-${rawRef.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 48)}`;

        const { data: newInv, error: invErr } = await supabase
          .from('invoices')
          .insert({
            invoice_number: invoiceNumber,
            amount: Number(tx.amount),
            currency: tx.currency || 'NGN',
            status: 'paid',
            due_date: null,
            portal_user_id: null,
            school_id: student?.school_id ?? null,
            payment_transaction_id: tx.id,
            items: [
              {
                description: progName ? `${enrollLabel} - ${progName}` : `${enrollLabel} Registration Fee`,
                program_name: progName || null,
                enrollment_type: enrollLabel,
                unit_price: Number(tx.amount),
                quantity: 1,
              },
            ],
            metadata: {
              registration_student_id: studentId,
              student_name: displayName,
              source: 'registration_verify_fallback',
            },
          })
          .select('id')
          .single();

        if (invErr) {
          console.error('Failed to create registration invoice from verify fallback:', invErr);
        } else if (newInv?.id) {
          await supabase
            .from('payment_transactions')
            .update({ invoice_id: newInv.id })
            .eq('id', tx.id);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      reference,
      studentName: gateway.student_name ?? null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Verification failed';
    console.error('Registration payment verify error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
