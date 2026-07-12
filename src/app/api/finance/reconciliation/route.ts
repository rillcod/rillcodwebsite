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
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
  }

  const admin = adminClient();
  const { searchParams } = new URL(request.url);
  const stream = searchParams.get('stream');
  const status = searchParams.get('status');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10) || 200, 1000);

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

  const enrichedRows = rows.map((row) => ({ ...row, ...describeLedgerEntry({ payment_method: row.method, school_id: row.school_id, portal_user_id: row.portal_user_id, invoices: row.invoice_number ? { invoice_number: row.invoice_number, stream: row.stream } : null }) }));

  const { runReconciliationRules } = await import('@/lib/finance/reconciliation-rules');
  const rules = await runReconciliationRules({ limit: 200 });

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
  });
}

// DELETE retains compatibility with the existing UI, but never deletes ledger rows.
// It voids only unsettled entries and preserves an audit trail in gateway metadata.
export async function DELETE(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
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
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = adminClient();
  const { data: profile } = await admin.from('portal_users').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden - admin only' }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || '');
  const entityId = String(body.entity_id || '');
  if (!action || !entityId) return NextResponse.json({ error: 'action and entity_id are required' }, { status: 400 });

  let result: Record<string, unknown>;
  if (action === 'recover_missing_receipt') {
    const { issueReceiptForTransaction } = await import('@/lib/finance/issue');
    result = await issueReceiptForTransaction(entityId);
  } else if (action === 'repair_allocation') {
    const { data: tx, error } = await admin.from('payment_transactions')
      .select('id, amount, invoice_id').eq('id', entityId).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!tx?.invoice_id) return NextResponse.json({ error: 'Payment has no linked invoice' }, { status: 409 });
    const { allocatePaymentToInvoice } = await import('@/lib/finance/allocate-payment');
    const allocation = await allocatePaymentToInvoice({ transactionId: tx.id, invoiceId: tx.invoice_id, amount: Number(tx.amount), actorId: user.id });
    if (!allocation.ok) {
      const mapped = financeResultToResponse(allocation);
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    result = allocation.data;
  } else if (action === 'recompute_invoice_balance') {
    const { recomputeInvoiceBalances } = await import('@/lib/finance/allocate-payment');
    await recomputeInvoiceBalances(entityId);
    result = { invoice_id: entityId, repaired: true };
  } else {
    return NextResponse.json({ error: 'Unsupported reconciliation action' }, { status: 400 });
  }
  await logAudit(admin as any, { action: `finance_reconciliation_${action}`, actorId: user.id, resourceType: action.includes('invoice') ? 'invoice' : 'payment_transaction', resourceId: entityId, newValues: result });
  return NextResponse.json({ success: true, action, entity_id: entityId, data: result });
}
