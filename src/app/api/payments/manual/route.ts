import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds } from '@/lib/auth-utils';
import { verifyInvoicePayment, verifySummerBalancePayment } from '@/lib/payments/verified-payment';

async function getCaller() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data } = await admin.from('portal_users').select('id, role, school_id').eq('id', user.id).single();
  return data as { id: string; role: string; school_id: string | null } | null;
}

/**
 * POST /api/payments/manual
 * Records an offline/manual payment transaction (cash, POS, bank transfer, cheque).
 * Admin: any school. School: scoped to its own school_id only.
 */
export async function POST(request: Request) {
  const caller = await getCaller();
  if (!caller || !['admin', 'school'].includes(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const {
    school_id,
    amount,
    currency = 'NGN',
    payment_method,
    reference,
    notes,
    portal_user_id,
    invoice_id,
    prospect_id,
    payment_type,
  } = body as {
    school_id?: string;
    amount?: number;
    currency?: string;
    payment_method?: string;
    reference?: string;
    notes?: string;
    portal_user_id?: string;
    invoice_id?: string;
    prospect_id?: string;
    payment_type?: string;
  };

  if (!amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }

  const ALLOWED_METHODS = ['cash', 'pos', 'bank_transfer', 'cheque', 'mobile_money', 'other'];
  const method = String(payment_method || 'cash').toLowerCase();
  if (!ALLOWED_METHODS.includes(method)) {
    return NextResponse.json({ error: `payment_method must be one of: ${ALLOWED_METHODS.join(', ')}` }, { status: 400 });
  }

  // School role can only record for their own school
  const effectiveSchoolId = caller.role === 'admin'
    ? (school_id || caller.school_id)
    : caller.school_id;

  const db = createAdminClient();
  const now = new Date().toISOString();
  const txRef = `MANUAL-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  if (invoice_id) {
    try {
      if (caller.role !== 'admin') {
        const { data: invoiceScope } = await db
          .from('invoices')
          .select('school_id, portal_user_id')
          .eq('id', invoice_id)
          .maybeSingle();
        if (!invoiceScope) {
          return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
        }
        const allowedSchoolIds = await getTeacherSchoolIds(caller.id, caller.school_id);
        let invoiceSchoolId = (invoiceScope as { school_id?: string | null; portal_user_id?: string | null }).school_id;
        const invoicePortalUserId = (invoiceScope as { portal_user_id?: string | null }).portal_user_id;
        if (!invoiceSchoolId && invoicePortalUserId) {
          const { data: payer } = await db
            .from('portal_users')
            .select('school_id')
            .eq('id', invoicePortalUserId)
            .maybeSingle();
          invoiceSchoolId = (payer as { school_id?: string | null } | null)?.school_id || null;
        }
        if (!invoiceSchoolId || !allowedSchoolIds.includes(invoiceSchoolId)) {
          return NextResponse.json({ error: 'Forbidden: invoice belongs to a different school' }, { status: 403 });
        }
      }
      const result = await verifyInvoicePayment({
        invoiceId: invoice_id,
        amount: Number(amount),
        currency,
        method,
        reference,
        note: notes,
        actorId: caller.id,
        source: 'manual_payment_route',
      });
      return NextResponse.json({ data: { id: result.transactionId, receipt_url: result.receiptUrl, invoice_id }, success: true }, { status: 201 });
    } catch (err: any) {
      return NextResponse.json({ error: err.message || 'Payment verification failed' }, { status: err.statusCode || 500 });
    }
  }

  if (payment_type === 'summer_school_balance' || prospect_id) {
    try {
      const result = await verifySummerBalancePayment({
        prospectId: prospect_id || '',
        amount: Number(amount),
        method,
        reference,
        note: notes,
        actorId: caller.id,
        source: 'manual_payment_route',
      });
      return NextResponse.json({ data: result, success: true }, { status: 201 });
    } catch (err: any) {
      return NextResponse.json({ error: err.message || 'Balance verification failed' }, { status: err.statusCode || 500 });
    }
  }

  if (!effectiveSchoolId) {
    return NextResponse.json({ error: 'school_id required' }, { status: 400 });
  }

  const { data, error } = await db
    .from('payment_transactions')
    .insert({
      school_id: effectiveSchoolId,
      portal_user_id: portal_user_id || null,
      invoice_id: invoice_id || null,
      amount: Number(amount),
      currency: String(currency).toUpperCase(),
      payment_method: method,
      payment_status: 'completed',
      transaction_reference: reference?.trim() || txRef,
      paid_at: now,
      created_at: now,
      updated_at: now,
      payment_gateway_response: {
        manual: true,
        recorded_by: caller.id,
        recorded_at: now,
        notes: notes?.trim() || null,
      },
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If linked to an invoice, mark it paid
  if (invoice_id) {
    await db
      .from('invoices')
      .update({ status: 'paid', updated_at: now, payment_transaction_id: data.id })
      .eq('id', invoice_id)
      .in('status', ['sent', 'overdue', 'partially_paid']); // allow paying sent or overdue invoices
  }

  // ── Post-insert: receipt PDF + email + staff notification ────────────
  // Fire-and-forget so the response isn't delayed by PDF generation.
  void (async () => {
    try {
      const { paymentsService } = await import('@/services/payments.service');
      const receiptUrl = await paymentsService.generateReceipt(data.id);

      // Resolve payer email (portal user → school billing contact → skip)
      let payerEmail: string | null = null;
      let payerName = 'Client';

      if (data.portal_user_id) {
        const { data: payer } = await db
          .from('portal_users')
          .select('full_name, email')
          .eq('id', data.portal_user_id)
          .maybeSingle();
        payerEmail = payer?.email || null;
        payerName = payer?.full_name || payerName;
      }
      if (!payerEmail && effectiveSchoolId) {
        const { data: contact } = await db
          .from('billing_contacts')
          .select('representative_email, representative_name')
          .eq('school_id', effectiveSchoolId)
          .maybeSingle();
        payerEmail = contact?.representative_email || null;
        payerName = contact?.representative_name || payerName;
        if (!payerEmail) {
          const { data: schoolUser } = await db
            .from('portal_users')
            .select('email, full_name')
            .eq('school_id', effectiveSchoolId)
            .eq('role', 'school')
            .maybeSingle();
          payerEmail = schoolUser?.email || null;
          payerName = schoolUser?.full_name || payerName;
        }
      }

      // Send branded receipt email with PDF attachment
      if (payerEmail && receiptUrl) {
        const { notificationsService } = await import('@/services/notifications.service');
        const { buildReceiptHTML } = await import('@/lib/finance/templates/html/receipt-html');
        const amt = Number(data.amount) || 0;
        const docRef = data.transaction_reference || data.id.slice(0, 8).toUpperCase();
        const dateStr = new Date().toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });

        // Fetch and attach the PDF
        let attachments: Array<{ filename: string; content: string }> | undefined;
        try {
          const r = await fetch(receiptUrl);
          if (r.ok) {
            const buf = Buffer.from(await r.arrayBuffer());
            const safeName = payerName.replace(/[^a-z0-9]+/gi, '_');
            attachments = [{ filename: `Rillcod-Receipt-${safeName}.pdf`, content: buf.toString('base64') }];
          }
        } catch { /* non-fatal */ }

        const html = buildReceiptHTML({
          docRef,
          dateStr,
          payDateStr: dateStr,
          payerLabel: payerName,
          payerType: effectiveSchoolId ? 'school' : 'student',
          paymentMethod: method,
          receivedBy: 'Rillcod Technologies',
          items: [{ description: notes?.trim() || 'Payment', quantity: 1, unit_price: amt }],
          totalAmount: amt,
          payToAcc: null,
          notes: `Reference: ${docRef}. Recorded manually by staff.`,
          mode: 'email',
          actionUrl: receiptUrl,
        });

        await notificationsService.sendExternalEmail({
          to: payerEmail,
          subject: `Payment Receipt — ₦${amt.toLocaleString('en-NG')} | Rillcod Technologies`,
          html,
          fromName: 'Rillcod Technologies',
          fromEmail: 'support@rillcod.com',
          ...(attachments ? { attachments } : {}),
        });
      }

      // Staff notification
      const { notifyStaffOfPayment } = await import('@/lib/payments/notify-staff');
      const amtStr = `${String(data.currency || 'NGN')} ${Number(data.amount).toLocaleString()}`;
      void notifyStaffOfPayment({
        schoolId: effectiveSchoolId,
        title: 'Manual Payment Recorded',
        message: `${payerName} — ${amtStr} via ${method} (ref: ${String(data.transaction_reference || '').slice(0, 20)}).`,
        actionUrl: '/dashboard/finance?tab=operations&ops=approvals',
      });
    } catch (err) {
      console.error('[manual-payment] Post-insert receipt/email failed:', err);
    }
  })();

  return NextResponse.json({ data }, { status: 201 });
}
