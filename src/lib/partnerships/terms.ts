/**
 * The one place a partnership price is read, computed and described.
 *
 * Before this, a school's rate was decided independently in four places:
 * `schools.commission_rate`, the `DEFAULT_COMMISSION_RATE` of 15 in
 * finance/streams, the invoice builder's own prefill, and a literal inside the
 * MoU generator. They disagreed — the MoU says Rillcod 70 / school 30 while the
 * receipt path bills 15 — and nothing reconciled them because nothing had to.
 *
 * Every surface that needs to know what a school pays calls this module: the
 * proposal, the MoU, the invoice builder and invoice issue. Adding a fifth
 * surface must mean adding a caller, never a fifth interpretation.
 *
 * The split maths deliberately delegates to `splitSchoolAmount` so there is
 * still exactly one implementation of "how a total divides".
 */
import { splitSchoolAmount } from '@/lib/finance/streams';

export type PartnershipBillingModel = 'per_student' | 'fixed_package' | 'tiered';

export type PartnershipTier = {
  label: string;
  count: number;
  rate: number;
};

export type PartnershipTerms = {
  id: string;
  school_id: string;
  billing_model: PartnershipBillingModel;
  currency: string;
  billing_cycle: string;
  amount_per_student: number | null;
  fixed_package_price: number | null;
  tiers: PartnershipTier[] | null;
  deposit_amount: number | null;
  rillcod_share_percent: number | null;
  school_share_percent: number | null;
  status: string;
};

/**
 * Raised when a school has no agreed terms.
 *
 * Deliberately an error rather than a default. Because every partnership rate is
 * negotiated separately, there is no value that makes a fallback safe — only
 * values that are wrong less often. A school with no agreed terms must stop the
 * invoice and say so, which is the failure the 15% default was hiding.
 */
export class MissingPartnershipTermsError extends Error {
  constructor(public readonly schoolId: string, public readonly schoolName?: string) {
    super(
      `${schoolName || 'This school'} has no agreed partnership terms, so there is no rate to bill. ` +
        'Record the agreed terms for the school, then issue the invoice.',
    );
    this.name = 'MissingPartnershipTermsError';
  }
}

function toTiers(raw: unknown): PartnershipTier[] | null {
  if (!Array.isArray(raw)) return null;
  const rows = raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({
      label: String(r.label ?? ''),
      count: Number(r.count) || 0,
      rate: Number(r.rate) || 0,
    }));
  return rows.length ? rows : null;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Normalise a database row into the shape the rest of the app uses. */
export function normaliseTerms(row: Record<string, unknown> | null | undefined): PartnershipTerms | null {
  if (!row?.id) return null;
  return {
    id: String(row.id),
    school_id: String(row.school_id),
    billing_model: row.billing_model as PartnershipBillingModel,
    currency: String(row.currency ?? 'NGN'),
    billing_cycle: String(row.billing_cycle ?? 'term'),
    amount_per_student: toNumber(row.amount_per_student),
    fixed_package_price: toNumber(row.fixed_package_price),
    tiers: toTiers(row.tiers),
    deposit_amount: toNumber(row.deposit_amount),
    rillcod_share_percent: toNumber(row.rillcod_share_percent),
    school_share_percent: toNumber(row.school_share_percent),
    status: String(row.status ?? 'draft'),
  };
}

const TERMS_COLUMNS =
  'id, school_id, billing_model, currency, billing_cycle, amount_per_student, ' +
  'fixed_package_price, tiers, deposit_amount, rillcod_share_percent, ' +
  'school_share_percent, status';

/**
 * The agreed terms in force for a school, or null when there are none.
 *
 * Only `agreed` counts. A draft is a negotiation and a proposed set is an offer;
 * neither is something to bill against. A partial unique index guarantees at
 * most one agreed row per school, so this cannot silently pick between two.
 */
export async function getAgreedTerms(
  db: { from: (t: string) => any },
  schoolId: string,
): Promise<PartnershipTerms | null> {
  if (!schoolId) return null;
  const { data } = await db
    .from('partnership_terms')
    .select(TERMS_COLUMNS)
    .eq('school_id', schoolId)
    .eq('status', 'agreed')
    .maybeSingle();
  return normaliseTerms(data);
}

/** Same, but refuses to continue without terms. Use on any billing path. */
export async function requireAgreedTerms(
  db: { from: (t: string) => any },
  schoolId: string,
  schoolName?: string,
): Promise<PartnershipTerms> {
  const terms = await getAgreedTerms(db, schoolId);
  if (!terms) throw new MissingPartnershipTermsError(schoolId, schoolName);
  return terms;
}

export type ChargeBreakdown = {
  /** What the agreed model produces before any deposit is taken off. */
  subtotal: number;
  deposit: number;
  balance: number;
  /** Rillcod's retained share of the subtotal. Equals subtotal when no split. */
  rillcodRetain: number;
  /** What the school keeps. Zero when no split is agreed. */
  schoolSettlement: number;
  /** Rillcod's percentage. 100 when the whole amount is Rillcod's. */
  sharePercent: number;
  revenueShareOn: boolean;
  currency: string;
};

/**
 * What a school owes for one cycle, and how it divides.
 *
 * `studentCount` is ignored by the fixed_package model and, for tiered, is only
 * a fallback: a tier list already carries its own counts, because that is what a
 * population band is.
 */
export function computeCharge(terms: PartnershipTerms, studentCount = 0): ChargeBreakdown {
  const count = Math.max(0, Math.floor(Number(studentCount) || 0));

  let subtotal = 0;
  if (terms.billing_model === 'fixed_package') {
    subtotal = terms.fixed_package_price ?? 0;
  } else if (terms.billing_model === 'tiered') {
    subtotal = (terms.tiers ?? []).reduce((sum, t) => sum + t.count * t.rate, 0);
  } else {
    subtotal = (terms.amount_per_student ?? 0) * count;
  }
  subtotal = +subtotal.toFixed(2);

  const deposit = Math.min(terms.deposit_amount ?? 0, subtotal);
  const balance = +(subtotal - deposit).toFixed(2);

  // No agreed split means the whole amount is Rillcod's — the school is paying a
  // rate, not sharing revenue. Reporting a 0% share here would repeat the bug
  // this module exists to remove.
  const revenueShareOn = terms.rillcod_share_percent != null;
  if (!revenueShareOn) {
    return {
      subtotal, deposit, balance,
      rillcodRetain: subtotal,
      schoolSettlement: 0,
      sharePercent: 100,
      revenueShareOn: false,
      currency: terms.currency,
    };
  }

  const split = splitSchoolAmount(subtotal, terms.rillcod_share_percent as number);
  return {
    subtotal, deposit, balance,
    rillcodRetain: split.rillcodRetain,
    schoolSettlement: split.schoolSettlement,
    sharePercent: split.rate,
    revenueShareOn: true,
    currency: terms.currency,
  };
}

function money(amount: number, currency: string): string {
  const symbol = currency === 'NGN' ? '₦' : `${currency} `;
  return `${symbol}${amount.toLocaleString('en-NG')}`;
}

/**
 * One sentence stating the deal, for a proposal or an MoU to print.
 *
 * Documents quote this rather than composing their own wording. The MoU
 * generator's hardcoded string and the README disagreed about which side held
 * 70% — a single phrasing, derived from the stored numbers, cannot.
 */
export function describeTerms(terms: PartnershipTerms): string {
  const cycle = terms.billing_cycle === 'term' ? 'per term' : `per ${terms.billing_cycle}`;

  let base: string;
  if (terms.billing_model === 'fixed_package') {
    base = `${money(terms.fixed_package_price ?? 0, terms.currency)} ${cycle} for the school`;
  } else if (terms.billing_model === 'tiered') {
    const bands = (terms.tiers ?? [])
      .map((t) => `${t.label || `${t.count} students`} at ${money(t.rate, terms.currency)}`)
      .join('; ');
    base = `banded pricing ${cycle} — ${bands}`;
  } else {
    base = `${money(terms.amount_per_student ?? 0, terms.currency)} per student ${cycle}`;
  }

  if (terms.rillcod_share_percent == null) return base;
  return (
    `${base}, shared Rillcod ${terms.rillcod_share_percent}% / ` +
    `school ${terms.school_share_percent}%`
  );
}
