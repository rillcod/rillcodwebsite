/**
 * Clear checkout attempts nobody ever finished, and the dead weight they left.
 *
 * An abandoned attempt is a `payment_status = 'failed'` row with neither a
 * supersede stamp nor a void stamp: the parent opened a payment link and walked
 * away. No money moved. They are safe to remove, but only under rules that make
 * it impossible to remove anything that did move money.
 *
 * The rules, in order of how much they matter:
 *
 *  1. Never touch a transaction that is not 'failed'.
 *  2. Never touch one that is superseded or voided — those were retired on
 *     purpose and their stamps are the audit trail.
 *  3. Never touch one whose prospect has ANY completed payment. A parent who
 *     abandoned one attempt and paid on the next has a real financial history,
 *     and the abandoned row is part of how that history reads.
 *  4. Never touch one attached to an invoice. An invoice means someone was
 *     billed; that belongs to the ledger, not to this sweep.
 *  5. Never touch one younger than a grace period — the parent may still be
 *     part-way through paying right now.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyRetiredAttempt } from '@/lib/finance/supersede-pending';

/** A parent mid-checkout must not have their attempt deleted underneath them. */
export const DEFAULT_GRACE_DAYS = 7;

export type AbandonedAttempt = {
  id: string;
  amount: number;
  currency: string;
  created_at: string | null;
  age_days: number | null;
  payer: string;
  parent_email: string | null;
  prospect_id: string | null;
  payment_type: string | null;
};

export type ClearPlan = {
  clearable: AbandonedAttempt[];
  /** Attempts that matched the shape but are protected, and by which rule. */
  kept: Array<{ id: string; payer: string; reason: string }>;
};

type Row = {
  id: string;
  amount: number | null;
  currency: string | null;
  created_at: string | null;
  invoice_id: string | null;
  payment_status: string | null;
  payment_gateway_response: Record<string, unknown> | null;
};

function ageDays(createdAt: string | null): number | null {
  if (!createdAt) return null;
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
}

function payerOf(meta: Record<string, any>): string {
  return String(meta.student_name || meta.parent_email || 'Unknown payer');
}

/**
 * Decide what may be cleared. Pure, so the rules are testable without a
 * database and the same answer drives both the preview and the delete.
 */
export function planClear(
  rows: readonly Row[],
  opts: { graceDays?: number; prospectsWithCompletedPayments: ReadonlySet<string> },
): ClearPlan {
  const grace = opts.graceDays ?? DEFAULT_GRACE_DAYS;
  const clearable: AbandonedAttempt[] = [];
  const kept: ClearPlan['kept'] = [];

  for (const row of rows) {
    const meta = (row.payment_gateway_response ?? {}) as Record<string, any>;
    const payer = payerOf(meta);
    const status = String(row.payment_status ?? '').toLowerCase();

    if (status !== 'failed') {
      kept.push({ id: row.id, payer, reason: `status is "${status}", not a retired attempt` });
      continue;
    }
    const kind = classifyRetiredAttempt(meta);
    if (kind !== 'abandoned') {
      kept.push({ id: row.id, payer, reason: `${kind} on purpose — its stamp is the audit trail` });
      continue;
    }
    if (row.invoice_id) {
      kept.push({ id: row.id, payer, reason: 'attached to an invoice — belongs to the ledger' });
      continue;
    }
    const prospectId = meta.prospect_id ? String(meta.prospect_id) : null;
    if (prospectId && opts.prospectsWithCompletedPayments.has(prospectId)) {
      kept.push({ id: row.id, payer, reason: 'this payer completed a payment — part of their history' });
      continue;
    }
    const age = ageDays(row.created_at);
    if (age !== null && age < grace) {
      kept.push({ id: row.id, payer, reason: `only ${age} day(s) old — they may still be paying` });
      continue;
    }

    clearable.push({
      id: row.id,
      amount: Number(row.amount ?? 0),
      currency: row.currency || 'NGN',
      created_at: row.created_at,
      age_days: age,
      payer,
      parent_email: meta.parent_email ? String(meta.parent_email) : null,
      prospect_id: prospectId,
      payment_type: meta.payment_type ? String(meta.payment_type) : null,
    });
  }

  return { clearable, kept };
}

/**
 * Build the plan from live data. Always call this before deleting so the
 * operator sees exactly what goes and what is being protected.
 */
export async function previewAbandonedAttempts(
  db: SupabaseClient,
  opts: { schoolId?: string | null; graceDays?: number; limit?: number } = {},
): Promise<ClearPlan> {
  let query = db
    .from('payment_transactions')
    .select('id, amount, currency, created_at, invoice_id, payment_status, payment_gateway_response')
    .eq('payment_status', 'failed')
    .order('created_at', { ascending: false })
    .limit(Math.min(opts.limit ?? 200, 500));
  if (opts.schoolId) query = query.eq('school_id', opts.schoolId) as typeof query;

  const { data, error } = await query;
  if (error) throw new Error(`Could not read payment attempts: ${error.message}`);
  const rows = (data ?? []) as Row[];

  // Which payers have ever actually paid — rule 3.
  const prospectIds = [...new Set(rows
    .map((r) => (r.payment_gateway_response as any)?.prospect_id)
    .filter(Boolean)
    .map(String))];
  const paid = new Set<string>();
  for (let i = 0; i < prospectIds.length; i += 100) {
    const chunk = prospectIds.slice(i, i + 100);
    const { data: completed } = await db
      .from('payment_transactions')
      .select('payment_gateway_response')
      .eq('payment_status', 'completed')
      .limit(1000);
    for (const c of completed ?? []) {
      const pid = (c.payment_gateway_response as any)?.prospect_id;
      if (pid && chunk.includes(String(pid))) paid.add(String(pid));
    }
    if (completed && completed.length < 1000) break;
  }

  return planClear(rows, { graceDays: opts.graceDays, prospectsWithCompletedPayments: paid });
}

/**
 * Delete the planned attempts. Re-plans from live data first: the preview the
 * operator saw may be minutes old, and a parent could have paid since.
 */
export async function clearAbandonedAttempts(
  db: SupabaseClient,
  opts: { ids: string[]; schoolId?: string | null; graceDays?: number },
): Promise<{ deleted: number; skipped: ClearPlan['kept'] }> {
  if (!opts.ids.length) return { deleted: 0, skipped: [] };

  const plan = await previewAbandonedAttempts(db, {
    schoolId: opts.schoolId,
    graceDays: opts.graceDays,
    limit: 500,
  });
  const allowed = new Set(plan.clearable.map((a) => a.id));
  const targets = opts.ids.filter((id) => allowed.has(id));
  const refused = opts.ids
    .filter((id) => !allowed.has(id))
    .map((id) => {
      const kept = plan.kept.find((k) => k.id === id);
      return { id, payer: kept?.payer ?? 'Unknown payer', reason: kept?.reason ?? 'no longer clearable' };
    });

  let deleted = 0;
  for (let i = 0; i < targets.length; i += 50) {
    const batch = targets.slice(i, i + 50);
    const { error } = await db
      .from('payment_transactions')
      .delete()
      .in('id', batch)
      .eq('payment_status', 'failed')
      .is('invoice_id', null);
    if (error) throw new Error(`Could not clear attempts: ${error.message}`);
    deleted += batch.length;
  }

  return { deleted, skipped: refused };
}
