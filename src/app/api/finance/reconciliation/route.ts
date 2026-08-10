/**
 * GET /api/finance/reconciliation
 *
 * Admin-only audit endpoint backed by the `finance_ledger` view
 * (added in migration 20260422000000). Returns a row-per-transaction
 * join of payment_transactions ↔ invoices ↔ receipts enriched with
 * the stream label, so an admin can trivially eyeball
 *
 *   * missing receipts for completed payments
 *   * pending bank-transfer proofs
 *   * refunds without reason
 *   * stream mis-classifications
 *
 * Query params:
 *   stream   — 'school' | 'individual' (optional)
 *   status   — payment_status filter (optional)
 *   from, to — ISO dates (optional)
 *   limit    — default 200, max 1000
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { splitSchoolAmount, DEFAULT_COMMISSION_RATE } from '@/lib/finance/streams';
import { describeLedgerEntry } from '@/lib/finance/ledger-description';
import { voidPaymentAttempt } from '@/lib/finance/void-payment';
import { financeResultToResponse } from '@/lib/finance/write-result';
import { logAudit } from '@/lib/audit/log';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile, error: profileError } = await supabase
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
    }

    const admin = adminClient();
    const { searchParams } = new URL(request.url);
    const stream = searchParams.get('stream');
    const status = searchParams.get('status');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 200);

    let q = (admin as any)
      .from('finance_ledger')
      .select('*')
      .order('transacted_at', { ascending: false })
      .limit(limit);

    if (stream === 'school' || stream === 'individual') q = q.eq('stream', stream);
    if (status) q = q.eq('status', status);
    if (from) q = q.gte('transacted_at', from);
    if (to) q = q.lte('transacted_at', to);

    const { data, error: err } = await q;
    if (err) return NextResponse.json({ error: err.message }, { status: 500 });

    const rows = (data ?? []) as any[];

    // Health signals — computed server-side so the UI is stupid-simple.
    let totalPaid = 0;
    let totalSchool = 0;
    let totalIndividual = 0;
    let missingReceipts = 0;
    let pending = 0;
    let refunded = 0;
    let commissionRetained = 0;

    rows.forEach((r) => {
      const amt = Number(r.amount || 0);
      const isCompleted = (r.status || '').toLowerCase() === 'completed' || (r.status || '').toLowerCase() === 'paid';
      if (isCompleted) {
        totalPaid += amt;
        if (!r.receipt_id) missingReceipts += 1;
        if (r.stream === 'school') {
          totalSchool += amt;
          const commRate = r.commission_rate != null ? Number(r.commission_rate) : DEFAULT_COMMISSION_RATE;
          commissionRetained += splitSchoolAmount(amt, commRate).rillcodRetain;
        }
        if (r.stream === 'individual') totalIndividual += amt;
      }
      if ((r.status || '').toLowerCase() === 'pending' || (r.status || '').toLowerCase() === 'processing') pending += 1;
      if ((r.status || '').toLowerCase() === 'refunded') refunded += 1;
    });

    const enrichedRows = rows.map((row) => ({
      ...row,
      ...describeLedgerEntry({
        payment_method: row.method,
        school_id: row.school_id,
        portal_user_id: row.portal_user_id,
        invoices: row.invoice_number ? { invoice_number: row.invoice_number, stream: row.stream } : null,
      }),
    }));

    let rules: { findings: unknown[]; summary: Record<string, number> } = { findings: [], summary: {} };
    try {
      const { runReconciliationRules } = await import('@/lib/finance/reconciliation-rules');
      rules = await runReconciliationRules({ limit: Math.min(limit, 100) });
    } catch (rulesErr: any) {
      console.error('[reconciliation] rules failed:', rulesErr?.message || rulesErr);
      return NextResponse.json({
        data: enrichedRows,
        summary: {
          count: rows.length,
          totalPaid,
          totalSchool,
          totalIndividual,
          commissionRetained,
          missingReceipts,
          pending,
          refunded,
          findings: {},
        },
        findings: [],
        complete: false,
        warning: 'Some reconciliation checks are temporarily unavailable',
      });
    }

    return NextResponse.json({
      data: enrichedRows,
      summary: {
        count: rows.length,
        totalPaid,
        totalSchool,
        totalIndividual,
        commissionRetained,
        missingReceipts,
        pending,
        refunded,
        findings: rules.summary,
      },
      findings: rules.findings,
      complete: true,
    });
  } catch (e: any) {
    console.error('[reconciliation] GET failed:', e?.message || e);
    return NextResponse.json(
      { error: e?.message || 'Reconciliation failed', findings: [], data: [], summary: {} },
      { status: 500 },
    );
  }
}

// DELETE retains compatibility with the existing UI, but never deletes ledger rows.
// It voids only unsettled entries and preserves an audit trail in gateway metadata.
export async function DELETE(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile, error: profileError } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (!profile || profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden - admin only' }, { status: 403 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const result = await voidPaymentAttempt(adminClient() as any, { transactionId: id, actorId: user.id, reason: 'Voided from reconciliation workspace' });
  if (!result.ok) {
    const mapped = financeResultToResponse(result);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
  return NextResponse.json({ success: true, action: 'voided', transaction_id: id, effects: result.effects });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const admin = adminClient();
    const { data: profile, error: profileError } = await admin.from('portal_users').select('role').eq('id', user.id).maybeSingle();
    if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
    if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden - admin only' }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '');

    // Bulk actions act on a set, not one row, so they run before the
    // single-entity guard below.
    if (action === 'preview_abandoned' || action === 'clear_abandoned') {
      const { previewAbandonedAttempts, clearAbandonedAttempts } =
        await import('@/lib/finance/clear-abandoned-attempts');
      const graceDays = Number.isFinite(Number(body.grace_days)) ? Number(body.grace_days) : undefined;

      if (action === 'preview_abandoned') {
        const plan = await previewAbandonedAttempts(admin as any, { graceDays });
        return NextResponse.json({ success: true, action, ...plan });
      }

      const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
      if (!ids.length) return NextResponse.json({ error: 'Select at least one attempt to clear' }, { status: 400 });
      const outcome = await clearAbandonedAttempts(admin as any, { ids, graceDays });
      await logAudit(admin as any, {
        action: 'finance_cleared_abandoned_attempts',
        actorId: user.id,
        resourceType: 'payment_transaction',
        resourceId: ids[0],
        newValues: { requested: ids.length, deleted: outcome.deleted, skipped: outcome.skipped },
      });
      return NextResponse.json({ success: true, action, ...outcome });
    }

    const entityId = String(body.entity_id || '');
    if (!action || !entityId) return NextResponse.json({ error: 'action and entity_id are required' }, { status: 400 });

    let result: Record<string, unknown>;

    if (action === 'repair_allocation') {
      const { data: tx, error } = await admin.from('payment_transactions')
        .select('id, amount, invoice_id, currency').eq('id', entityId).maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!tx?.invoice_id) {
        return NextResponse.json({
          error: 'This payment is not linked to any invoice, so allocation cannot be repaired. Link it to an invoice first, or dismiss if it was a standalone payment.',
          code: 'no_invoice',
        }, { status: 409 });
      }

      const { data: inv, error: invoiceError } = await admin
        .from('invoices')
        .select('id, invoice_number, status, amount_paid, amount_remaining, original_amount, amount')
        .eq('id', tx.invoice_id)
        .maybeSingle();
      if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 });
      if (!inv) return NextResponse.json({ error: 'Linked invoice not found' }, { status: 409 });

      // Legacy: invoice already marked paid with no allocation rows — backfill only.
      const remaining = Number(inv?.amount_remaining ?? 0);
      const alreadyPaid = String(inv?.status || '').toLowerCase() === 'paid' || remaining <= 0.01;
      if (alreadyPaid) {
        const { data: existingAlloc, error: allocationLookupError } = await (admin as any)
          .from('payment_allocations')
          .select('id')
          .eq('payment_transaction_id', tx.id)
          .eq('invoice_id', tx.invoice_id)
          .maybeSingle();
        if (allocationLookupError) {
          return NextResponse.json({ error: allocationLookupError.message }, { status: 500 });
        }
        if (existingAlloc?.id) {
          result = { status: 'already_allocated', allocation_id: existingAlloc.id, invoice_id: tx.invoice_id };
        } else {
          const { data: inserted, error: insErr } = await (admin as any)
            .from('payment_allocations')
            .insert({
              payment_transaction_id: tx.id,
              invoice_id: tx.invoice_id,
              amount: Number(tx.amount) || 0,
              currency: tx.currency || 'NGN',
              created_by: user.id,
            })
            .select('id')
            .maybeSingle();
          if (insErr || !inserted?.id) {
            return NextResponse.json({
              error: `Could not backfill allocation for paid invoice ${inv?.invoice_number || tx.invoice_id}: ${insErr?.message || 'no allocation row returned'}`,
              code: 'backfill_failed',
            }, { status: 500 });
          }
          result = {
            status: 'backfilled',
            allocation_id: inserted?.id,
            invoice_id: tx.invoice_id,
            invoice_number: inv?.invoice_number,
            note: 'Invoice was already paid — created missing allocation row without changing balances.',
          };
        }
      } else {
        const { allocatePaymentToInvoice } = await import('@/lib/finance/allocate-payment');
        const allocation = await allocatePaymentToInvoice({
          transactionId: tx.id,
          invoiceId: tx.invoice_id,
          amount: Number(tx.amount),
          actorId: user.id,
        });
        if (!allocation.ok) {
          const mapped = financeResultToResponse(allocation);
          return NextResponse.json({
            ...mapped.body,
            error: (mapped.body as any).error || 'Allocation repair failed',
            hint: 'Invoice may have no remaining balance, or payment is already partially allocated.',
          }, { status: mapped.status });
        }
        result = allocation.data as Record<string, unknown>;
      }
    } else if (action === 'recompute_invoice_balance') {
      try {
        const { recomputeInvoiceBalances } = await import('@/lib/finance/allocate-payment');
        await recomputeInvoiceBalances(entityId);
        result = { invoice_id: entityId, repaired: true };
      } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'Balance recompute failed' }, { status: 500 });
      }
    } else if (action === 'recover_missing_receipt') {
      try {
        // Fast path: receipt PDF exists but transaction.receipt_url was never linked.
        const { data: existingReceipt, error: receiptLookupError } = await (admin as any)
          .from('receipts')
          .select('id, receipt_number, pdf_url')
          .eq('transaction_id', entityId)
          .maybeSingle();
        if (receiptLookupError) throw new Error(`Receipt lookup failed: ${receiptLookupError.message}`);
        if (existingReceipt?.pdf_url) {
          const { data: linked, error: linkErr } = await admin
            .from('payment_transactions')
            .update({ receipt_url: existingReceipt.pdf_url })
            .eq('id', entityId)
            .select('id')
            .maybeSingle();
          if (linkErr || !linked) {
            return NextResponse.json({
              error: `Receipt PDF exists but could not link to payment: ${linkErr?.message || 'payment not found'}`,
              code: 'link_failed',
            }, { status: 500 });
          }
          result = {
            status: 'linked_existing',
            receipt_id: existingReceipt.id,
            receipt_number: existingReceipt.receipt_number,
            url: existingReceipt.pdf_url,
            note: 'Linked existing receipt PDF to the payment.',
          };
        } else {
          const { issueReceiptForTransaction } = await import('@/lib/finance/issue');
          result = await issueReceiptForTransaction(entityId) as unknown as Record<string, unknown>;
        }
      } catch (e: any) {
        const msg = e?.message || 'Receipt recovery failed';
        const status = typeof e?.statusCode === 'number' ? e.statusCode : 500;
        return NextResponse.json({
          error: msg,
          hint: /on is not a function|PDF generation failed|pdfmake/i.test(msg)
            ? 'PDF engine failed while building the receipt. Retry recover after deploy; if it persists, open the payment in Receipts and re-issue.'
            : 'If a receipt row already exists without a PDF, check storage credentials. You can also open the payment in Receipts and re-issue.',
        }, { status });
      }
    } else {
      return NextResponse.json({ error: `Unsupported repair action: ${action}` }, { status: 400 });
    }

    await logAudit(admin as any, {
      action: `finance_reconciliation_${action}`,
      actorId: user.id,
      resourceType: action.includes('invoice') ? 'invoice' : 'payment_transaction',
      resourceId: entityId,
      newValues: result,
    });
    return NextResponse.json({ success: true, action, entity_id: entityId, data: result });
  } catch (e: any) {
    console.error('[reconciliation] POST failed:', e?.message || e);
    return NextResponse.json({ error: e?.message || 'Repair failed' }, { status: 500 });
  }
}
