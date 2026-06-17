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
      .select('id, invoice_number, amount, currency, status, payment_transaction_id, portal_user_id, school_id')
      .eq('id', invoiceId)
      .maybeSingle();
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    // School boundary for non-admins.
    if (caller.role !== 'admin' && caller.school_id && invoice.school_id && invoice.school_id !== caller.school_id) {
      return NextResponse.json({ error: 'Forbidden: invoice belongs to a different school' }, { status: 403 });
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

    // Ensure a payment_transactions record exists.
    let transactionId = invoice.payment_transaction_id as string | null;
    if (!transactionId) {
      // Unique-suffixed so a partial-failure retry can't collide on transaction_reference.
      const ref = `MAN-INV-${String(invoice.invoice_number || invoice.id).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 32)}-${Date.now().toString().slice(-6)}`;
      const { data: tx, error: txErr } = await admin
        .from('payment_transactions')
        .insert({
          portal_user_id: invoice.portal_user_id,
          school_id: invoice.school_id,
          amount: invoiceAmount,
          currency: invoice.currency || 'NGN',
          payment_method: 'manual',
          payment_status: 'completed',
          transaction_reference: ref,
          paid_at: new Date().toISOString(),
          invoice_id: invoice.id,
          payment_gateway_response: { source: 'manual_invoice_paid', invoice_id: invoice.id, approved_by: user.id },
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (txErr || !tx) {
        return NextResponse.json({ error: `Failed to create payment record: ${txErr?.message}` }, { status: 500 });
      }
      transactionId = tx.id;
    } else {
      // Make sure the existing transaction is marked completed.
      await admin.from('payment_transactions')
        .update({ payment_status: 'completed', paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', transactionId)
        .neq('payment_status', 'completed');
    }

    // Mark the invoice paid + link the transaction.
    await admin.from('invoices')
      .update({ status: 'paid', payment_transaction_id: transactionId, updated_at: new Date().toISOString() })
      .eq('id', invoice.id);

    // Generate the receipt (idempotent → shows on-platform in the Receipts panel)
    // AND email it (PDF attachment + link) to the payer.
    if (transactionId) {
      try {
        const { paymentsService } = await import('@/services/payments.service');
        const receiptUrl = await paymentsService.generateReceipt(transactionId);

        if (invoice.portal_user_id) {
          const { data: payer } = await admin
            .from('portal_users')
            .select('full_name, email')
            .eq('id', invoice.portal_user_id)
            .maybeSingle();
          if (payer?.email) {
            const { notificationsService } = await import('@/services/notifications.service');
            const { buildReceiptHTML } = await import('@/lib/finance/templates/html/receipt-html');
            const now = new Date();
            const dateStr = now.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });
            const html = buildReceiptHTML({
              docRef: invoice.invoice_number || transactionId.slice(0, 8).toUpperCase(),
              dateStr,
              payDateStr: dateStr,
              payerLabel: payer.full_name || payer.email,
              payerType: 'student',
              paymentMethod: 'manual',
              receivedBy: 'Rillcod Technologies',
              items: [{ description: `Invoice ${invoice.invoice_number || ''} — Academic Fee`, quantity: 1, unit_price: invoiceAmount }],
              totalAmount: invoiceAmount,
              payToAcc: null,
              notes: `Invoice ${invoice.invoice_number || ''} settled. Keep this receipt for your records.`,
              mode: 'email',
              actionUrl: receiptUrl,
            });
            let attachments: Array<{ filename: string; content: string }> | undefined;
            if (receiptUrl) {
              try {
                const r = await fetch(receiptUrl);
                if (r.ok) {
                  const buf = Buffer.from(await r.arrayBuffer());
                  const safeName = (payer.full_name || 'Payer').replace(/[^a-z0-9]+/gi, '_');
                  attachments = [{ filename: `Rillcod-Receipt-${safeName}.pdf`, content: buf.toString('base64') }];
                }
              } catch { /* attachment optional */ }
            }
            await notificationsService.sendExternalEmail({
              to: payer.email,
              subject: `Payment Receipt — ₦${invoiceAmount.toLocaleString('en-NG')} | Rillcod Technologies`,
              html,
              fromName: 'Rillcod Technologies',
              fromEmail: 'support@rillcod.com',
              ...(attachments ? { attachments } : {}),
            } as any);
          }
        }
      } catch (rErr) {
        console.error('[mark-paid] receipt generation/email failed:', rErr);
      }
    }
    await logAudit(admin as any, {
      action: 'invoice_marked_paid',
      actorId: user.id,
      resourceType: 'invoice',
      resourceId: invoice.id,
      newValues: { amount: invoiceAmount, currency: invoice.currency, transaction_id: transactionId },
    });

    return NextResponse.json({ success: true, transactionId });
  } catch (err: any) {
    console.error('[invoices/mark-paid]', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
