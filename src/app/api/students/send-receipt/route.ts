import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { Database } from '@/types/supabase';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { issueReceiptForTransaction } from '@/lib/finance/issue';

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
      .select('id, role, school_id')
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
      .select('id, name, full_name, student_email, parent_email, parent_name, school_id, school_name, registration_paystack_reference, user_id')
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

    // Primary: by the student's linked portal user (transactions are linked to the
    // student during onboarding — most reliable, matches the finance records).
    if (student.user_id) {
      const { data } = await supabaseAdmin
        .from('payment_transactions')
        .select('*')
        .eq('portal_user_id', student.user_id)
        .in('payment_status', ['completed', 'success', 'paid'])
        .order('paid_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      tx = data;
    }

    const ref = student.registration_paystack_reference?.trim();

    if (!tx && ref) {
      const { data } = await supabaseAdmin
        .from('payment_transactions')
        .select('*')
        .eq('transaction_reference', ref)
        .in('payment_status', ['completed', 'success', 'paid'])
        .maybeSingle();
      tx = data;
    }

    // Fallback 1: match by prospect record (server-side filter)
    if (!tx && student.parent_email) {
      const { data: prospect } = await supabaseAdmin
        .from('prospective_students')
        .select('id')
        .eq('parent_email', student.parent_email.trim().toLowerCase())
        .eq('full_name', student.full_name || student.name)
        .maybeSingle();

      if (prospect) {
        const { data: found } = await supabaseAdmin
          .from('payment_transactions')
          .select('*')
          .contains('payment_gateway_response', { prospect_id: prospect.id })
          .in('payment_status', ['completed', 'success', 'paid'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (found) tx = found;
      }
    }

    // Fallback 2: match by parent_email in payment_gateway_response (server-side filter)
    if (!tx && student.parent_email) {
      const { data: found } = await supabaseAdmin
        .from('payment_transactions')
        .select('*')
        .contains('payment_gateway_response', { parent_email: student.parent_email.trim().toLowerCase() })
        .in('payment_status', ['completed', 'success', 'paid'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (found) tx = found;
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

    // Generate the canonical receipt PDF FIRST (same generator the finance hub
    // uses) so the email body can embed a real "View / Print Receipt" link —
    // the in-template print button is JS-only and email clients strip JS.
    const warnings: string[] = [];
    let attachments: Array<{ filename: string; content: string }> | undefined;
    let receiptUrl = '';
    try {
      const receipt = await issueReceiptForTransaction(tx.id);
      receiptUrl = receipt.url;
    } catch (pdfErr) {
      const message = pdfErr instanceof Error ? pdfErr.message : 'Receipt issuance failed';
      return NextResponse.json({ success: false, error: message, code: 'receipt_issue_failed' }, { status: 500 });
    }
    try {
      const response = await fetch(receiptUrl);
      if (response.ok) {
        const buf = Buffer.from(await response.arrayBuffer());
        const safeName = (student.full_name || student.name || 'Student').replace(/[^a-z0-9]+/gi, '_');
        attachments = [{ filename: `Rillcod-Receipt-${safeName}.pdf`, content: buf.toString('base64') }];
      } else warnings.push('Receipt email includes the official link, but the PDF attachment could not be downloaded.');
    } catch { warnings.push('Receipt email includes the official link, but the PDF attachment could not be downloaded.'); }

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
      mode: 'email',
      actionUrl: receiptUrl || null,
    });

    await notificationsService.sendExternalEmail({
      to: emailNorm,
      subject: `Payment Receipt — Summer School 2026 | Rillcod Technologies`,
      html: receiptHtml,
      fromName: 'Rillcod Technologies',
      fromEmail: 'support@rillcod.com',
      ...(attachments ? { attachments } : {}),
    });

    return NextResponse.json({
      success: true,
      message: `Receipt successfully sent to ${emailNorm}.`,
      effects: ['canonical_receipt_issued', 'receipt_email_sent'],
      ...(warnings.length ? { warnings } : {}),
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
