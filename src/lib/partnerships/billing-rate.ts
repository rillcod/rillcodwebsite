/**
 * Which rate to bill a school at, while terms are still being recorded.
 *
 * The end state is simple: billing reads `partnership_terms` and refuses when a
 * school has none, because no fallback value is safe when every deal is
 * negotiated separately. Switching to that today would stop invoicing for all
 * 29 schools at once, since every one of them still sits on the
 * `commission_rate = 15` column default.
 *
 * So this is a grace period with a deadline built in. Agreed terms win wherever
 * they exist. Where they do not, the legacy column is still used — but the
 * result says so, every fallback is logged, and `countSchoolsAwaitingTerms`
 * makes the remaining gap a number somebody can watch go to zero.
 *
 * The grace period is not a permanent second source of truth. When the count
 * reaches zero, set PARTNERSHIP_TERMS_REQUIRED=1 and the fallback becomes a
 * refusal — which is the behaviour `requireAgreedTerms` already implements.
 */
import { DEFAULT_COMMISSION_RATE } from '@/lib/finance/streams';
import { MissingPartnershipTermsError, getAgreedTerms, type PartnershipTerms } from './terms';

export type BillingRateSource =
  /** An agreed partnership_terms row. The destination. */
  | 'agreed_terms'
  /** The school's own legacy commission_rate. Grace period only. */
  | 'legacy_school_rate'
  /** The 15% constant. Grace period only, and always wrong for somebody. */
  | 'legacy_default';

export type ResolvedBillingRate = {
  /** Rillcod's share, as splitSchoolAmount's commissionRate. */
  rate: number;
  source: BillingRateSource;
  /** Present only when the rate came from agreed terms. */
  terms: PartnershipTerms | null;
  /** True while this school is still billing on a legacy value. */
  provisional: boolean;
};

/** Has the grace period been closed? */
export function partnershipTermsRequired(): boolean {
  return process.env.PARTNERSHIP_TERMS_REQUIRED === '1';
}

/**
 * The rate to bill this school at.
 *
 * Never silently prefers a legacy value: when one is used, `provisional` is true
 * and the reason is logged with the school's name, so the gap is visible in logs
 * as well as countable in the database.
 */
export async function resolveBillingRate(
  db: { from: (t: string) => any },
  school: { id: string; name?: string | null; commission_rate?: number | null },
): Promise<ResolvedBillingRate> {
  const terms = await getAgreedTerms(db, school.id);

  if (terms?.rillcod_share_percent != null) {
    return { rate: terms.rillcod_share_percent, source: 'agreed_terms', terms, provisional: false };
  }

  // Agreed terms with no split mean the whole amount is Rillcod's — a flat rate,
  // not a share. 100 is the honest commissionRate for that, and it is emphatically
  // not the 0 the invoice builder currently prefills.
  if (terms) {
    return { rate: 100, source: 'agreed_terms', terms, provisional: false };
  }

  if (partnershipTermsRequired()) {
    throw new MissingPartnershipTermsError(school.id, school.name ?? undefined);
  }

  const legacy = school.commission_rate;
  const usable = legacy != null && Number.isFinite(Number(legacy));
  const rate = usable ? Number(legacy) : DEFAULT_COMMISSION_RATE;

  console.warn(
    `[billing-rate] ${school.name || school.id} has no agreed partnership terms; ` +
      `billing provisionally at ${rate}% from ${usable ? 'schools.commission_rate' : 'the 15% default'}. ` +
      'Record the agreed terms to make this authoritative.',
  );

  return {
    rate,
    source: usable ? 'legacy_school_rate' : 'legacy_default',
    terms: null,
    provisional: true,
  };
}

export type TermsGap = {
  total: number;
  withTerms: number;
  awaiting: number;
  schools: Array<{ id: string; name: string }>;
};

/**
 * How many partner schools are still billing on a legacy rate.
 *
 * This is the number that closes the grace period. While it is above zero,
 * somebody is being invoiced on a figure nobody agreed.
 */
export async function countSchoolsAwaitingTerms(db: {
  from: (t: string) => any;
}): Promise<TermsGap> {
  const { data: schools } = await db
    .from('schools')
    .select('id, name')
    .neq('is_deleted', true)
    .order('name');

  const { data: agreed } = await db
    .from('partnership_terms')
    .select('school_id')
    .eq('status', 'agreed');

  const covered = new Set((agreed ?? []).map((r: { school_id: string }) => String(r.school_id)));
  const all = (schools ?? []) as Array<{ id: string; name: string }>;
  const awaiting = all.filter((s) => !covered.has(String(s.id)));

  return {
    total: all.length,
    withTerms: all.length - awaiting.length,
    awaiting: awaiting.length,
    schools: awaiting.map((s) => ({ id: String(s.id), name: String(s.name) })),
  };
}
