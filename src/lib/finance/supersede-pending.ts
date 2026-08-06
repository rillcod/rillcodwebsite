/**
 * Retire unfinished payment attempts, and say why.
 *
 * Three routes did this inline — the balance route, the summer-school route and
 * the registration route — each writing `payment_status = 'failed'` with no
 * marker. `voidPaymentAttempt` writes the same status but stamps
 * `reconciliation_voided`. So one status meant three different things: an
 * attempt replaced by a newer one, an attempt an admin voided, and an attempt
 * that genuinely failed or was abandoned. No finance report could separate
 * them, which is how 33 rows read as "82% of payments failed" when most were
 * neither failures nor even distinct attempts.
 *
 * The JSONB merge runs in the database because PostgREST cannot merge per row
 * in a bulk update: doing it here meant read-then-write per row, racing the very
 * attempt that triggered the supersede.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** Metadata key that marks an attempt as retired in favour of a newer one. */
export const SUPERSEDED_AT = 'superseded_at';
/** Metadata key `voidPaymentAttempt` already stamps. Kept here so readers agree. */
export const VOIDED_MARKER = 'reconciliation_voided';

export type SupersedeOutcome = {
  /** How many pending attempts were retired. */
  superseded: number;
  /** Present when the sweep could not run; callers log rather than fail the payment. */
  error: string | null;
};

/**
 * How a retired attempt should be read back.
 *
 * `abandoned` is deliberately not called `failed`: an attempt with no marker is
 * one the parent never completed, which is a funnel outcome, not a gateway
 * rejection. Reporting that conflates the two overstates payment failure.
 */
export type RetiredAttemptKind = 'superseded' | 'voided' | 'abandoned';

export function classifyRetiredAttempt(
  metadata: Record<string, unknown> | null | undefined,
): RetiredAttemptKind {
  const meta = metadata ?? {};
  if (meta[VOIDED_MARKER]) return 'voided';
  if (meta[SUPERSEDED_AT]) return 'superseded';
  return 'abandoned';
}

/**
 * @param match  containment filter on `payment_gateway_response` — the same
 *               shape the caller uses to find its own attempts.
 * @param replacedByReference the reference of the attempt taking its place, so
 *               a retired row points at what replaced it.
 */
export async function supersedePendingAttempts(
  db: Pick<SupabaseClient, 'rpc'>,
  params: {
    match: Record<string, unknown>;
    replacedByReference?: string | null;
    reason?: string;
  },
): Promise<SupersedeOutcome> {
  if (!params.match || Object.keys(params.match).length === 0) {
    return { superseded: 0, error: 'a match filter is required' };
  }

  const { data, error } = await (db as SupabaseClient).rpc(
    'supersede_pending_payment_attempts' as never,
    {
      p_match: params.match,
      p_replaced_by: params.replacedByReference ?? null,
      p_reason: params.reason ?? 'replaced_by_newer_attempt',
    } as never,
  );

  if (error) return { superseded: 0, error: error.message };
  return { superseded: Number(data ?? 0), error: null };
}
