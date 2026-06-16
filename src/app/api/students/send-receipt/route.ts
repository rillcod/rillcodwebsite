import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { Database } from '@/types/supabase';

const supabaseAdmin = createAdminClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const bodySchema = z.object({
  studentId: z.string().uuid('Invalid student ID format'),
});

interface SummerGatewayResponse {
  prospect_id?: string;
  student_name?: string;
  parent_email?: string;
  payment_type?: string;
  payment_plan?: string;
  preferred_mode?: string;
  total_tuition?: number;
  amount_charged?: number;
  balance_due?: number;
  balance_payment?: boolean;
}

type PaymentTransactionRow = Database['public']['Tables']['payment_transactions']['Row'];

export async function POST(req: NextRequest) {
  try {
    // 1. Verify caller is admin or teacher
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: caller } = await supabaseAdmin
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!caller || !['admin', 'teacher'].includes(caller.role)) {
      return NextResponse.json({ error: 'Admin or teacher access required' }, { status: 403 });
    }

    // 2. Parse payload
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid parameters' }, { status: 400 });
    }
    const { studentId } = parsed.data;

    // 3. Fetch student record
    const { data: student, error: studErr } = await supabaseAdmin
      .from('students')
      .select('id, name, full_name, student_email, parent_email, parent_name, school_id, school_name, registration_paystack_reference')
      .eq('id', studentId)
      .single();

    if (studErr || !student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const emailNorm = (student.parent_email || student.student_email || '').trim().toLowerCase();
    if (!emailNorm) {
      return NextResponse.json({ error: 'Student has no parent or student email' }, { status: 400 });
    }

    // 4. Try to find completed payment transaction
    let tx: PaymentTransactionRow | null = null;
    const ref = student.registration_paystack_reference?.trim();

    if (ref) {
      const { data } = await supabaseAdmin
        .from('payment_transactions')
        .select('*')
        .eq('transaction_reference', ref)
        .eq('payment_status', 'completed')
        .maybeSingle();
      tx = data;
    }

    // Fallback 1: match by prospect record
    if (!tx && student.parent_email) {
      const { data: prospect } = await supabaseAdmin
        .from('prospective_students')
        .select('id')
        .eq('parent_email', student.parent_email.trim().toLowerCase())
        .eq('full_name', student.full_name || student.name)
        .maybeSingle();

      if (prospect) {
        const { data: txList } = await supabaseAdmin
          .from('payment_transactions')
          .select('*')
          .eq('payment_status', 'completed')
          .order('created_at', { ascending: false });

        if (txList) {
          const found = txList.find((t: PaymentTransactionRow) => {
            const gw = (t.payment_gateway_response ?? {}) as unknown as SummerGatewayResponse;
            return gw.prospect_id === prospect.id;
          });
          if (found) tx = found;
        }
      }
    }

    // Fallback 2: match by parent_email in payment_gateway_response
    if (!tx && student.parent_email) {
      const { data: txList } = await supabaseAdmin
        .from('payment_transactions')
        .select('*')
        .eq('payment_status', 'completed')
        .order('created_at', { ascending: false });

      if (txList) {
        const found = txList.find((t: PaymentTransactionRow) => {
          const gw = (t.payment_gateway_response ?? {}) as unknown as SummerGatewayResponse;
          const parentEmailStr = gw.parent_email ?? '';
          return parentEmailStr.trim().toLowerCase() === student.parent_email!.trim().toLowerCase();
        });
        if (found) tx = found;
      }
    }

    // Fallback 3: match by student_name in payment_gateway_response
    if (!tx) {
      const { data: txList } = await supabaseAdmin
        .from('payment_transactions')
        .select('*')
        .eq('payment_status', 'completed')
        .order('created_at', { ascending: false });

      if (txList) {
        const found = txList.find((t: PaymentTransactionRow) => {
          const gw = (t.payment_gateway_response ?? {}) as unknown as SummerGatewayResponse;
          const sName = gw.student_name ?? '';
          return sName.toLowerCase() === (student.full_name || student.name).toLowerCase();
        });
        if (found) tx = found;
      }
    }

    if (!tx) {
      return NextResponse.json({
        error: 'No completed transaction on record for this student.'
      }, { status: 404 });
    }

    // 5. Send receipt email
    const { notificationsService } = await import('@/services/notifications.service');
    const { buildReceiptHTML } = await import('@/lib/finance/templates/html/receipt-html');

    const amt = Number(tx.amount) || 0;
    const docRef = tx.transaction_reference || `SUM-${studentId.slice(0, 8).toUpperCase()}`;

    const fmt = (d: string | null) => d
      ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
      : new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });

    const receiptHtml = buildReceiptHTML({
      docRef,
      dateStr: fmt(null),
      payDateStr: fmt(tx.paid_at || null),
      payerLabel: student.parent_name || student.full_name || student.name,
      payerType: 'student',
      paymentMethod: tx.payment_method || 'online',
      receivedBy: 'Rillcod Technologies',
      items: [{ description: `Summer School 2026 Tuition — ${student.full_name || student.name}`, quantity: 1, unit_price: amt }],
      totalAmount: amt,
      payToAcc: null,
      notes: `Reference: ${docRef}. Student: ${student.full_name || student.name}. School: ${student.school_name || 'Rillcod Online School'}.`,
    });

    await notificationsService.sendExternalEmail({
      to: emailNorm,
      subject: `Payment Receipt — Summer School 2026 | Rillcod Technologies`,
      html: receiptHtml,
      fromName: 'Rillcod Technologies',
      fromEmail: 'support@rillcod.com',
    });

    return NextResponse.json({
      success: true,
      message: `Receipt successfully sent to ${emailNorm}.`,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
