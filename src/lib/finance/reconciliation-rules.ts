import { createAdminClient } from '@/lib/supabase/admin';
import { assertDbOk } from '@/lib/finance/write-result';

export type ReconciliationFinding = {
  kind:
    | 'missing_receipt'
    | 'unmatched_payment'
    | 'under_allocated'
    | 'over_allocated'
    | 'balance_mismatch';
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

  // Completed payments missing receipts
  let missingQ = db
    .from('payment_transactions')
    .select('id, amount, invoice_id, receipt_url, school_id')
    .in('payment_status', ['completed', 'success', 'paid'])
    .is('receipt_url', null)
    .limit(limit);
  if (opts?.schoolId) missingQ = missingQ.eq('school_id', opts.schoolId) as typeof missingQ;
  const { data: missingReceipts, error: missErr } = await missingQ;
  assertDbOk(missErr, 'reconciliation missing receipts');
  for (const row of missingReceipts ?? []) {
    findings.push({
      kind: 'missing_receipt',
      severity: 'warning',
      entity_type: 'payment_transaction',
      entity_id: row.id,
      message: 'Completed payment has no receipt_url',
      meta: { invoice_id: row.invoice_id, amount: row.amount },
    });
  }

  // Unmatched: completed with no invoice_id
  let unmatchedQ = db
    .from('payment_transactions')
    .select('id, amount, school_id')
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
      message: 'Completed payment is not linked to an invoice',
      meta: { amount: row.amount },
    });
  }

  // Allocation sum vs transaction amount
  const { data: txs, error: txErr } = await db
    .from('payment_transactions')
    .select('id, amount, invoice_id')
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
    if ((allocs ?? []).length === 0 && tx.invoice_id) {
      findings.push({
        kind: 'under_allocated',
        severity: 'info',
        entity_type: 'payment_transaction',
        entity_id: tx.id,
        message: 'Payment linked to invoice but has no allocation rows (legacy)',
        meta: { invoice_id: tx.invoice_id, amount: txAmount },
      });
    } else if (allocated + 0.01 < txAmount) {
      findings.push({
        kind: 'under_allocated',
        severity: 'warning',
        entity_type: 'payment_transaction',
        entity_id: tx.id,
        message: `Allocated ${allocated} is less than payment ${txAmount}`,
        meta: { allocated, amount: txAmount },
      });
    } else if (allocated > txAmount + 0.01) {
      findings.push({
        kind: 'over_allocated',
        severity: 'error',
        entity_type: 'payment_transaction',
        entity_id: tx.id,
        message: `Allocated ${allocated} exceeds payment ${txAmount}`,
        meta: { allocated, amount: txAmount },
      });
    }
  }

  // Invoice balance self-check
  const { data: invoices, error: invErr } = await db
    .from('invoices')
    .select('id, original_amount, amount, amount_paid, amount_remaining, status')
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
          message: `Balance mismatch: paid(${paid}) + remaining(${remaining}) != original(${original})`,
        });
      }
    }
  }

  const summary: Record<string, number> = {};
  for (const f of findings) summary[f.kind] = (summary[f.kind] || 0) + 1;

  return { findings, summary };
}
