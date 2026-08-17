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
  /**
   * When the school's share arrives, and what moves it.
   *
   * The money page tells a proprietor what they earn and then stops; the next
   * three questions are always when do I get paid, do I get paid if the parents
   * have not, and what happens when a child leaves in week four. They are
   * commercial terms, so they live here beside the rate rather than in template
   * prose, where they would be the same promise made to every school regardless
   * of what was negotiated. Null throughout means nothing was agreed, and a
   * document that prints a date nobody agreed is worse than one that does not.
   */
  settlement_days: number | null;
  settlement_trigger: SettlementTrigger | null;
  withdrawal_policy: WithdrawalPolicy | null;
  /** Enrolment floor below which the programme is re-scoped rather than run. */
  minimum_students: number | null;
  status: string;
};

/** Whether we carry the collection risk, or share it. */
export type SettlementTrigger = 'term_end' | 'on_collection';
export type WithdrawalPolicy = 'pro_rata' | 'no_refund' | 'credit_next_term';

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
    settlement_days: toNumber(row.settlement_days),
    settlement_trigger: SETTLEMENT_TRIGGERS.includes(row.settlement_trigger as SettlementTrigger)
      ? (row.settlement_trigger as SettlementTrigger)
      : null,
    withdrawal_policy: WITHDRAWAL_POLICIES.includes(row.withdrawal_policy as WithdrawalPolicy)
      ? (row.withdrawal_policy as WithdrawalPolicy)
      : null,
    minimum_students: toNumber(row.minimum_students),
    status: String(row.status ?? 'draft'),
  };
}

const TERMS_COLUMNS =
  'id, school_id, billing_model, currency, billing_cycle, amount_per_student, ' +
  'fixed_package_price, tiers, deposit_amount, rillcod_share_percent, ' +
  'school_share_percent, settlement_days, settlement_trigger, withdrawal_policy, ' +
  'minimum_students, status';

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

/** The two shapes a settlement can take, in the order the editor offers them. */
export const SETTLEMENT_TRIGGERS: readonly SettlementTrigger[] = ['term_end', 'on_collection'];
export const WITHDRAWAL_POLICIES: readonly WithdrawalPolicy[] = [
  'pro_rata',
  'no_refund',
  'credit_next_term',
];

export type SettlementPoint = { label: string; body: string };

/**
 * How and when the school is paid, as sentences a document can print.
 *
 * Returns only what was actually agreed. A school whose terms say nothing about
 * withdrawals gets no withdrawal sentence — the alternative is a template
 * promising every school the same thing, which is precisely the drift that put
 * a 15% default and a hardcoded 30% share into this codebase.
 *
 * The one thing stated unconditionally is the mechanism: the share is worked
 * from enrolment rather than projection. That is not a negotiated term, it is
 * how the arithmetic on the page above it was done, and leaving it out is what
 * makes a proprietor assume the number is a forecast.
 */
export function settlementPoints(terms: PartnershipTerms | null): SettlementPoint[] {
  const points: SettlementPoint[] = [
    {
      label: 'Worked from actual enrolment',
      body: 'Your share is calculated on the learners who actually enrol each term, not on the projection above. If uptake is lower, both sides earn less on the same terms; nothing is owed on students who did not join.',
    },
  ];
  if (!terms) return points;

  if (terms.settlement_trigger === 'on_collection') {
    points.push({
      label: 'Settled as fees are collected',
      body: terms.settlement_days
        ? `Your share is released within ${terms.settlement_days} days of the fees being collected, so collection risk sits with neither party alone.`
        : 'Your share is released as the programme fees are collected, so collection risk sits with neither party alone.',
    });
  } else if (terms.settlement_trigger === 'term_end') {
    points.push({
      label: 'Settled at the end of each term',
      body: terms.settlement_days
        ? `Your share is paid within ${terms.settlement_days} days of the term ending, whether or not every parent has settled by then. We carry the collection risk.`
        : 'Your share is paid at the end of each term, whether or not every parent has settled by then. We carry the collection risk.',
    });
  }

  if (terms.withdrawal_policy) {
    points.push({
      label: 'If a learner withdraws mid-term',
      body:
        terms.withdrawal_policy === 'pro_rata'
          ? 'The term is charged pro rata to the sessions actually taught, and your share follows the same reduction.'
          : terms.withdrawal_policy === 'credit_next_term'
            ? 'The balance of the term is carried as a credit against the following term rather than refunded, and your share follows it.'
            : 'The term is charged in full, because the facilitator and the equipment were committed to that slot for the whole of it.',
    });
  }

  if (terms.minimum_students) {
    points.push({
      label: 'If uptake is very low',
      body: `Below ${terms.minimum_students} enrolled learners we will re-scope the programme with you rather than run it thinly — a session with too few children in it is not worth either side's name on it.`,
    });
  }

  return points;
}

/**
 * What we suggest when nobody has decided yet.
 *
 * A blank form is not help. Four empty fields on a terms editor is the same
 * work as writing the clause from scratch, and the likely outcome is that they
 * stay empty and the proposal goes on saying nothing about the questions its
 * own numbers raise.
 *
 * So the editor opens on a position we can defend, and whoever is agreeing the
 * deal changes it. The reasoning behind each:
 *
 *   `on_collection` rather than `term_end`. Paying a school's share before the
 *   parents have paid means fronting somebody else's revenue out of working
 *   capital, every term, for every school. It is the more generous position and
 *   it is the one that breaks a small business in a bad term. Where the school
 *   invoices parents directly it is also the natural one, because the money is
 *   in their hands first.
 *
 *   Fourteen days. Long enough to reconcile a term's enrolment against what was
 *   actually collected, short enough that a bursar does not have to chase it.
 *
 *   `pro_rata` on withdrawal. It is the answer a proprietor expects, it is
 *   arithmetic rather than judgement, and refusing to refund a term a child did
 *   not attend is the kind of clause that wins one term and loses the renewal.
 *
 *   A floor of forty. Below roughly two class-sets the facilitator cost per
 *   child stops working, and a session with eight children in it does not look
 *   like the programme anybody was sold.
 *
 * None of these print until they are saved against a school, because a
 * suggestion nobody accepted is not a term.
 */
export const RECOMMENDED_SETTLEMENT = {
  settlement_trigger: 'on_collection' as SettlementTrigger,
  settlement_days: 14,
  withdrawal_policy: 'pro_rata' as WithdrawalPolicy,
  minimum_students: 40,
} as const;
