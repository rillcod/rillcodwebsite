/**
 * POST /api/invoices/mark-paid   (admin / teacher / school)
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
    if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    const { invoiceId, amount } = await req.json().catch(() => ({}));
    if (!invoiceId) return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 });

    const { data: invoice } = await admin
      .from('invoices')
      .select('id, invoice_number, amount, currency, status, payment_transaction_id, portal_user_id, school_id, portal_users(school_id)')
      .eq('id', invoiceId)
      .maybeSingle();
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    // School boundary for non-admins: the invoice must belong to the caller's
    // school either directly or via the billed student's school.
    if (caller.role !== 'admin') {
      const studentSchoolId = (invoice as any).portal_users?.school_id ?? null;
      const inTenant = !!caller.school_id
        && (invoice.school_id === caller.school_id || studentSchoolId === caller.school_id);
      if (!inTenant) {
        return NextResponse.json({ error: 'Forbidden: invoice belongs to a different school' }, { status: 403 });
      }
    }

    if (invoice.status === 'paid') {
      return NextResponse.json({ success: true, message: 'Invoice already paid', alreadyPaid: true });
    }
    if (invoice.status === 'cancelled' || invoice.status === 'void') {
      return NextResponse.json({ error: `Cannot mark a ${invoice.status} invoice as paid.` }, { status: 409 });
    }

    const invoiceAmount = Number(invoice.amount) || 0;
    // Validate supplied amount against the invoice (1-naira tolerance for rounding).
    if (amount != null) {
      const paidAmount = Number(amount);
      if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - invoiceAmount) > 1) {
        return NextResponse.json(
          { error: `Payment amount (${paidAmount}) does not match the invoice amount (${invoiceAmount}).` },
          { status: 400 },
        );
      }
    }

    const result = await verifyInvoicePayment({
      invoiceId: invoice.id,
      amount: invoiceAmount,
      currency: invoice.currency || 'NGN',
      method: 'manual',
      actorId: user.id,
      source: 'manual_invoice_paid',
    });

    await logAudit(admin as any, {
      action: 'invoice_marked_paid',
      actorId: user.id,
      resourceType: 'invoice',
      resourceId: invoice.id,
      newValues: { amount: invoiceAmount, currency: invoice.currency, transaction_id: result.transactionId },
    });

    return NextResponse.json({ success: true, transactionId: result.transactionId, receiptUrl: result.receiptUrl });
  } catch (err: any) {
    console.error('[invoices/mark-paid]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
