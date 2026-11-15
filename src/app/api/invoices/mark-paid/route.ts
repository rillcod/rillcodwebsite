/**
 * POST /api/invoices/mark-paid   (finance administrator only)
 * Body: { invoiceId: string; amount?: number }
 *
 * #12 — Invoice lifecycle guard. Marking an invoice paid must be consistent:
 *   • Validate any supplied payment amount against the invoice amount.
 *   • ALWAYS ensure a payment_transactions record exists (create a manual one if
 *     the invoice has none) so finance/receipts reconcile.
 *   • Generate the receipt + write an audit log.
 * Replaces the raw `update({ status: 'paid' })` the dashboard used.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/log';
import { verifyInvoicePayment } from '@/lib/payments/verified-payment';
import { roleHasCapability } from '@/lib/auth/capabilities';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { data: caller } = await admin.from('portal_users').select('role, school_id').eq('id', user.id).single();
    if (!caller || !roleHasCapability(caller.role, 'manage_finance')) {
      return NextResponse.json({ error: 'Finance administrator access required' }, { status: 403 });
    }

    const { invoiceId, amount, method, reference, note } = await req.json().catch(() => ({}));
    if (!invoiceId) return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 });

    const { data: invoice } = await admin
      .from('invoices')
      .select('id, invoice_number, amount, original_amount, amount_paid, amount_remaining, currency, status, stream, payment_transaction_id, portal_user_id, school_id, metadata, portal_users!invoices_portal_user_id_fkey(school_id)')
      .eq('id', invoiceId)
      .maybeSingle();
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    if (invoice.status === 'paid' && amount == null) {
      return NextResponse.json({ success: true, message: 'Invoice already paid', alreadyPaid: true });
    }
    if (invoice.status === 'cancelled' || invoice.status === 'void') {
      return NextResponse.json({ error: `Cannot mark a ${invoice.status} invoice as paid.` }, { status: 409 });
    }

    const remainingAmount = Number(
      invoice.amount_remaining != null
        ? invoice.amount_remaining
        : Math.max(0, Number(invoice.original_amount ?? invoice.amount ?? 0) - Number(invoice.amount_paid ?? 0)),
    );
    const defaultAmount = remainingAmount > 0 ? remainingAmount : Number(invoice.amount) || 0;
    const paidAmount = amount != null ? Number(amount) : defaultAmount;

    if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
      return NextResponse.json(
        { error: 'Enter a valid payment amount greater than zero.' },
        { status: 400 },
      );
    }

    const result = await verifyInvoicePayment({
      invoiceId: invoice.id,
      amount: paidAmount,
      currency: invoice.currency || 'NGN',
      method: method || 'manual',
      reference: reference || undefined,
      note: note || undefined,
      actorId: user.id,
      source: 'manual_invoice_paid',
    });

    const overpaidAmount = result.overpaidAmount ?? 0;
    const nextRemaining = result.remainingAmount ?? 0;
    const resolvedStatus = result.status ?? (nextRemaining > 0.01 ? 'partially_paid' : 'paid');

    await logAudit(admin as any, {
      action: resolvedStatus === 'partially_paid' ? 'invoice_partially_paid' : 'invoice_marked_paid',
      actorId: user.id,
      resourceType: 'invoice',
      resourceId: invoice.id,
      newValue: `Invoice ${invoice.invoice_number || invoice.id.slice(0, 8)} · ${(invoice.currency || 'NGN')} ${paidAmount.toLocaleString()} ${resolvedStatus === 'partially_paid' ? 'partial payment recorded' : overpaidAmount > 0 ? `marked paid (+${overpaidAmount.toLocaleString()} credit)` : 'marked paid'}`,
      newValues: {
        summary: `Recorded ${(invoice.currency || 'NGN')} ${paidAmount.toLocaleString()} on invoice ${invoice.invoice_number || '—'}`,
        invoice_number: invoice.invoice_number,
        amount: paidAmount,
        invoice_total: Number(invoice.amount) || 0,
        overpaid_amount: overpaidAmount,
        remaining_amount: nextRemaining,
        status: resolvedStatus,
        method: method || 'manual',
        currency: invoice.currency,
        transaction_id: result.transactionId,
      },
    });

    return NextResponse.json({
      success: true,
      transactionId: result.transactionId,
      receiptUrl: result.receiptUrl,
      status: resolvedStatus,
      paidAmount,
      overpaidAmount,
      remainingAmount: nextRemaining,
    });
  } catch (err: any) {
    console.error('[invoices/mark-paid]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
