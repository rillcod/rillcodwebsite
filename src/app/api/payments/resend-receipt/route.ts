import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { buildReceiptHTML } from '@/lib/finance/templates/html/receipt-html';

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// POST /api/payments/resend-receipt
// Body: { portalUserId: string } | { studentId: string }
// Admin/teacher — resends the branded receipt email for the most recent completed payment
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: caller } = await supabaseAdmin
      .from('portal_users')
      .select('role, id')
      .eq('id', user.id)
      .single();
    if (!caller || !['admin', 'teacher'].includes(caller.role)) {
      return NextResponse.json({ error: 'Admin or teacher access required' }, { status: 403 });
    }

    const body = await req.json();
    let portalUserId: string | null = body.portalUserId || null;

    // If studentId provided, resolve to portal_user_id via students table
    if (!portalUserId && body.studentId) {
      const { data: stu } = await supabaseAdmin
        .from('students')
        .select('user_id, parent_email, student_email, full_name')
        .eq('id', body.studentId)
        .single();
      if (!stu?.user_id) {
        return NextResponse.json({ error: 'Student has no portal account yet. Activate first.' }, { status: 400 });
      }
      portalUserId = stu.user_id;
    }

    if (!portalUserId) return NextResponse.json({ error: 'portalUserId or studentId is required' }, { status: 400 });

    // Get payer details
    const { data: payer } = await supabaseAdmin
      .from('portal_users')
      .select('full_name, email')
      .eq('id', portalUserId)
      .single();

    if (!payer?.email) {
      return NextResponse.json({ error: 'No email on file for this user' }, { status: 400 });
    }

    // Find the most recent completed payment for this user
    const { data: tx } = await supabaseAdmin
      .from('payment_transactions')
      .select('id, amount, currency, payment_method, transaction_reference, paid_at, created_at')
      .eq('portal_user_id', portalUserId)
      .in('payment_status', ['completed', 'success'])
      .order('paid_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!tx) {
      return NextResponse.json({ error: 'No completed payment found for this user' }, { status: 404 });
    }

    const amt = Number(tx.amount) || 0;
    const docRef = tx.transaction_reference || tx.id.slice(0, 8).toUpperCase();
    const now = new Date();
    const fmt = (d: string | null) => d
      ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
      : now.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });

    const methodLabels: Record<string, string> = {
      bank_transfer: 'Bank Transfer', cash: 'Cash', pos: 'POS Terminal',
      cheque: 'Cheque', online: 'Online Payment', paystack: 'Online Payment (Paystack)',
    };

    const html = buildReceiptHTML({
      docRef,
      dateStr: fmt(null),
      payDateStr: fmt(tx.paid_at || tx.created_at),
      payerLabel: payer.full_name || payer.email,
      payerType: 'student',
      paymentMethod: tx.payment_method || 'online',
      receivedBy: 'Rillcod Technologies',
      items: [{ description: 'Academic Enrolment / Tuition Fee', quantity: 1, unit_price: amt }],
      totalAmount: amt,
      payToAcc: null,
      notes: `Reference: ${docRef}. Resent on request — original payment date: ${fmt(tx.paid_at || tx.created_at)}.`,
    });

    const { notificationsService } = await import('@/services/notifications.service');
    await notificationsService.sendExternalEmail({
      to: payer.email,
      subject: `Payment Receipt (Resent) — ₦${amt.toLocaleString('en-NG')} | Rillcod Technologies`,
      html,
      fromName: 'Rillcod Technologies',
      fromEmail: 'support@rillcod.com',
    });

    return NextResponse.json({
      success: true,
      message: `Receipt resent to ${payer.email}`,
      amount: amt,
      reference: docRef,
    });
  } catch (err: any) {
    console.error('[resend-receipt]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
