import { createAdminClient } from '@/lib/supabase/admin';
import { assertDbOk } from '@/lib/finance/write-result';

export type ReconciliationFinding = {
  kind:
    | 'missing_receipt'
    | 'unmatched_payment'
    | 'under_allocated'
    | 'over_allocated'
    | 'balance_mismatch'
    | 'refund_needs_attention';
  severity: 'info' | 'warning' | 'error';
  entity_type: 'payment_transaction' | 'invoice';
  entity_id: string;
  message: string;
  meta?: Record<string, unknown>;
};

/**
 * Consolidate reconciliation rules into one module.
 */
export async function runReconciliationRules(opts?: {
  schoolId?: string | null;
  limit?: number;
}): Promise<{ findings: ReconciliationFinding[]; summary: Record<string, number> }> {
  const db = createAdminClient();
  const limit = opts?.limit ?? 200;
  const findings: ReconciliationFinding[] = [];

  let refundAttentionQ = db.from('payment_transactions')
    .select('id, amount, currency, school_id, payment_gateway_response')
    .contains('payment_gateway_response', { refund: { provider: 'paystack' } })
    .limit(limit);
  if (opts?.schoolId) refundAttentionQ = refundAttentionQ.eq('school_id', opts.schoolId) as typeof refundAttentionQ;
  const { data: refundRows, error: refundError } = await refundAttentionQ;
  assertDbOk(refundError, 'reconciliation refund recovery');
  for (const row of refundRows ?? []) {
    const gateway = row.payment_gateway_response && typeof row.payment_gateway_response === 'object' && !Array.isArray(row.payment_gateway_response)
      ? row.payment_gateway_response as Record<string, any> : {};
    const status = String(gateway.refund?.status || '').toLowerCase();
    if (['needs-attention', 'needs_attention', 'failed'].includes(status)) findings.push({
      kind: 'refund_needs_attention', severity: 'error', entity_type: 'payment_transaction', entity_id: row.id,
      message: 'Paystack refund needs customer bank details or another recovery attempt',
      meta: { refund_id: gateway.refund?.id, status, amount: row.amount, currency: row.currency },
    });
  }

  // Completed payments missing receipts
  let missingQ = db
    .from('payment_transactions')
    .select('id, amount, currency, invoice_id, receipt_url, school_id, transaction_reference, invoices(invoice_number), schools(name)')
    .in('payment_status', ['completed', 'success', 'paid'])
    .is('receipt_url', null)
    .limit(limit);
  if (opts?.schoolId) missingQ = missingQ.eq('school_id', opts.schoolId) as typeof missingQ;
  const { data: missingReceipts, error: missErr } = await missingQ;
  assertDbOk(missErr, 'reconciliation missing receipts');
  for (const row of missingReceipts ?? []) {
    const invNo = (row as any).invoices?.invoice_number;
    const schoolName = (row as any).schools?.name;
    findings.push({
      kind: 'missing_receipt',
      severity: 'warning',
      entity_type: 'payment_transaction',
      entity_id: row.id,
      message: `Paid ${Number(row.amount).toLocaleString('en-NG')} ${(row as any).currency || 'NGN'}${invNo ? ` on ${invNo}` : ''}${schoolName ? ` · ${schoolName}` : ''} — receipt PDF not linked yet`,
      meta: {
        invoice_id: row.invoice_id,
        invoice_number: invNo,
        amount: row.amount,
        currency: (row as any).currency,
        reference: (row as any).transaction_reference,
        school_name: schoolName,
        fix: 'Generate/link receipt PDF for this completed payment',
      },
    });
  }

  // Unmatched: completed with no invoice_id
  let unmatchedQ = db
    .from('payment_transactions')
    .select('id, amount, currency, school_id, transaction_reference, schools(name)')
    .in('payment_status', ['completed', 'success', 'paid'])
    .is('invoice_id', null)
    .limit(limit);
  if (opts?.schoolId) unmatchedQ = unmatchedQ.eq('school_id', opts.schoolId) as typeof unmatchedQ;
  const { data: unmatched, error: unErr } = await unmatchedQ;
  assertDbOk(unErr, 'reconciliation unmatched payments');
  for (const row of unmatched ?? []) {
    findings.push({
      kind: 'unmatched_payment',
      severity: 'warning',
      entity_type: 'payment_transaction',
      entity_id: row.id,
      message: `Paid ${Number(row.amount).toLocaleString('en-NG')} ${(row as any).currency || 'NGN'}${(row as any).schools?.name ? ` · ${(row as any).schools.name}` : ''} has no invoice link`,
      meta: {
        amount: row.amount,
        currency: (row as any).currency,
        reference: (row as any).transaction_reference,
        school_name: (row as any).schools?.name,
        fix: 'Link this payment to an invoice, or leave if it was intentional standalone',
      },
    });
  }

  // Allocation sum vs transaction amount
  const { data: txs, error: txErr } = await db
    .from('payment_transactions')
    .select('id, amount, currency, invoice_id, invoices(invoice_number, status, amount_remaining)')
    .in('payment_status', ['completed', 'success', 'paid'])
    .not('invoice_id', 'is', null)
    .limit(limit);
  assertDbOk(txErr, 'reconciliation load transactions');

  for (const tx of txs ?? []) {
    const { data: allocs, error: aErr } = await (db as any)
      .from('payment_allocations')
      .select('amount')
      .eq('payment_transaction_id', tx.id);
    if (aErr) {
      // Table may not exist yet pre-migration — skip allocation checks
      if (/payment_allocations|does not exist/i.test(aErr.message)) break;
      assertDbOk(aErr, 'reconciliation load allocations');
    }
    const allocated = (allocs ?? []).reduce((s: number, r: { amount: number }) => s + Number(r.amount || 0), 0);
    const txAmount = Number(tx.amount || 0);
    const invNo = (tx as any).invoices?.invoice_number;
    const invStatus = (tx as any).invoices?.status;
    if ((allocs ?? []).length === 0 && tx.invoice_id) {
      findings.push({
        kind: 'under_allocated',
        severity: invStatus === 'paid' ? 'info' : 'warning',
        entity_type: 'payment_transaction',
        entity_id: tx.id,
        message: invStatus === 'paid'
          ? `Legacy gap: ${invNo || 'invoice'} is paid but missing an allocation row — Repair will backfill safely`
          : `Payment ${txAmount.toLocaleString('en-NG')} linked to ${invNo || 'invoice'} has no allocation rows`,
        meta: {
          invoice_id: tx.invoice_id,
          invoice_number: invNo,
          invoice_status: invStatus,
          amount: txAmount,
          currency: (tx as any).currency,
          fix: invStatus === 'paid' ? 'Backfill allocation (no balance change)' : 'Create allocation against remaining balance',
        },
      });
    } else if (allocated + 0.01 < txAmount) {
      findings.push({
        kind: 'under_allocated',
        severity: 'warning',
        entity_type: 'payment_transaction',
        entity_id: tx.id,
        message: `${invNo || 'Payment'}: allocated ₦${allocated.toLocaleString('en-NG')} is less than paid ₦${txAmount.toLocaleString('en-NG')}`,
        meta: { allocated, amount: txAmount, invoice_id: tx.invoice_id, invoice_number: invNo },
      });
    } else if (allocated > txAmount + 0.01) {
      findings.push({
        kind: 'over_allocated',
        severity: 'error',
        entity_type: 'payment_transaction',
        entity_id: tx.id,
        message: `${invNo || 'Payment'}: allocated ₦${allocated.toLocaleString('en-NG')} exceeds paid ₦${txAmount.toLocaleString('en-NG')}`,
        meta: { allocated, amount: txAmount, invoice_id: tx.invoice_id, invoice_number: invNo, fix: 'Manual review — cannot auto-repair over-allocation' },
      });
    }
  }

  // Invoice balance self-check
  const { data: invoices, error: invErr } = await db
    .from('invoices')
    .select('id, invoice_number, original_amount, amount, amount_paid, amount_remaining, status')
    .in('status', ['sent', 'partially_paid', 'paid', 'overdue'])
    .limit(limit);
  if (invErr && /amount_paid|original_amount|amount_remaining/i.test(invErr.message)) {
    // pre-migration
  } else {
    assertDbOk(invErr, 'reconciliation invoices');
    for (const inv of invoices ?? []) {
      const original = Number((inv as any).original_amount ?? (inv as any).amount ?? 0);
      const paid = Number((inv as any).amount_paid ?? 0);
      const remaining = Number((inv as any).amount_remaining ?? 0);
      if (Math.abs(paid + remaining - original) > 0.01) {
        findings.push({
          kind: 'balance_mismatch',
          severity: 'error',
          entity_type: 'invoice',
          entity_id: inv.id,
          message: `${(inv as any).invoice_number || 'Invoice'}: paid(${paid}) + remaining(${remaining}) ≠ original(${original})`,
          meta: {
            invoice_number: (inv as any).invoice_number,
            paid,
            remaining,
            original,
            fix: 'Recompute balances from allocation rows',
          },
        });
      }
    }
  }

  const summary: Record<string, number> = {};
  for (const f of findings) summary[f.kind] = (summary[f.kind] || 0) + 1;

  return { findings, summary };
}
