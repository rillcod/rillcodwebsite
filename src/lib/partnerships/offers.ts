/**
 * The standard offers a school chooses from.
 *
 * These are the same three the proposal has always presented; they were literal
 * table rows inside build_proposal_with_cover_and_curriculum.py. They are a
 * catalogue, not per-school data: every school sees the same menu, and what
 * differs per school is which one they take and at what number — which is what
 * `partnership_terms` records.
 *
 * Keeping the menu here rather than in a table is deliberate for now. Three
 * standard offers that change perhaps once a year are configuration, and a
 * proposal must render identically for every prospect. When they start varying
 * per school or per season, they graduate to a table — the shape below is
 * already the row shape that would take.
 */
import type { PartnershipBillingModel } from './terms';

export type PartnershipOffer = {
  /** Stable key, used when terms record which offer was taken. */
  code: string;
  name: string;
  /** Who it is for, in the words the proposal uses. */
  scope: string;
  /** Contact time, as a school timetables it. */
  cadence: string;
  /** What a parent pays per student per term. A range where one exists. */
  priceFrom: number;
  priceTo: number;
  billingModel: PartnershipBillingModel;
  /** Why a school would pick this one over the others. */
  bestFor: string;
};

export const PARTNERSHIP_OFFERS: readonly PartnershipOffer[] = [
  {
    code: 'A',
    name: 'Extracurricular Club',
    scope: 'Basic 1 through SS 2',
    cadence: '1 session per week (2 hours)',
    priceFrom: 25000,
    priceTo: 30000,
    billingModel: 'per_student',
    bestFor:
      'Starting without touching the timetable. Opt-in students, one after-school session, and the fastest way to prove the programme to parents.',
  },
  {
    code: 'B1',
    name: 'Timetable Integration — 1 class a week',
    scope: 'All classes, primary to secondary',
    cadence: '1 class per week',
    priceFrom: 10000,
    priceTo: 10000,
    billingModel: 'per_student',
    bestFor:
      'Reaching every student rather than the few who opt in. The lowest per-student fee, because the whole school is enrolled.',
  },
  {
    code: 'B2',
    name: 'Timetable Integration — 2 classes a week',
    scope: 'All classes, primary to secondary',
    cadence: '2 classes per week',
    priceFrom: 15000,
    priceTo: 15000,
    billingModel: 'per_student',
    bestFor:
      'Covering the full twelve-year progression at pace. Two contact hours is what the capstone builds in each year assume.',
  },
] as const;

export function findOffer(code: string | null | undefined): PartnershipOffer | null {
  if (!code) return null;
  const wanted = String(code).trim().toUpperCase();
  return PARTNERSHIP_OFFERS.find((o) => o.code === wanted) ?? null;
}

/**
 * The one offer a proposal is quoting, from whatever the caller had to hand.
 *
 * `scopeToOffer` has always been loosely typed: the builder sends a code, older
 * callers sent the scope line. Each consumer then matched on whichever field it
 * happened to think about, and the two disagreed —
 *
 *   the fee came from a match on `code`, so 'B1' priced correctly;
 *   the highlight came from a match on `scope`, and 'B1' matches no scope at
 *   all, so nothing was emphasised and all three options printed as equals.
 *
 * Worse when a scope line was sent: `scope` is the audience, and B1 and B2
 * share theirs word for word, so quoting one lit up both.
 *
 * Matching in one place ends that. Code first because it is unique, then name,
 * and scope last with the tie broken by the first match — a scope that names
 * two options cannot identify one, so it picks the cheaper rather than both.
 */
export function resolveOffer(value: string | null | undefined): PartnershipOffer | null {
  if (!value) return null;
  const wanted = String(value).trim();
  if (!wanted) return null;
  const upper = wanted.toUpperCase();
  const lower = wanted.toLowerCase();
  return (
    PARTNERSHIP_OFFERS.find((o) => o.code.toUpperCase() === upper) ??
    PARTNERSHIP_OFFERS.find((o) => o.name.toLowerCase() === lower) ??
    PARTNERSHIP_OFFERS.find((o) => o.scope.toLowerCase() === lower) ??
    null
  );
}

export type OfferRecommendation = {
  offer: PartnershipOffer;
  /** Why this one, in the words the proposal prints. Never mentions a fee. */
  reason: string;
  /** What the recommendation was drawn from, for the person about to send it. */
  basis: 'roll' | 'stage' | 'default';
};

/**
 * Which option to put in front of this school.
 *
 * The proposal already said "picked for the size of your roll and the room your
 * timetable has". Nothing was reading the roll — a human chose from a dropdown
 * and the document claimed a reasoning it had not done. This makes the sentence
 * true, and prints the actual reason under it so a head teacher can disagree
 * with the argument rather than just the price.
 *
 * The rules are deliberately few and deliberately explainable:
 *
 *   A small roll cannot fill a whole-school timetable slot, and a proprietor
 *   with eighty students is not going to rebuild their week for an unproven
 *   subject. Option A proves it after school first.
 *
 *   A large roll is where whole-school integration pays: the per-student fee is
 *   lowest precisely because everybody is enrolled, and opt-in at that size
 *   leaves most of the school out.
 *
 *   In between, two contact hours is what the capstone builds actually assume,
 *   so B2 is the honest recommendation rather than the cheaper one.
 *
 * This is a starting position, not a verdict. Whoever is sending the proposal
 * can override it, and should when they know something the roll does not say.
 */
export const SMALL_ROLL_CEILING = 120;
export const LARGE_ROLL_FLOOR = 600;

export function recommendOffer(input: {
  studentCount?: number | null;
  stage?: 'primary' | 'secondary' | 'both' | null;
}): OfferRecommendation {
  const roll = Number(input.studentCount) || 0;
  const byCode = (code: string) => PARTNERSHIP_OFFERS.find((o) => o.code === code)!;

  if (roll > 0 && roll <= SMALL_ROLL_CEILING) {
    return {
      offer: byCode('A'),
      basis: 'roll',
      reason: `With around ${roll} learners on roll, an opt-in club proves the programme to your parents before it asks anything of your timetable.`,
    };
  }

  if (roll >= LARGE_ROLL_FLOOR) {
    return {
      offer: byCode('B1'),
      basis: 'roll',
      reason: `At around ${roll} learners, integrating one class a week reaches every child rather than the few who opt in, and the per-student fee is at its lowest because the whole school is enrolled.`,
    };
  }

  if (roll > 0) {
    return {
      offer: byCode('B2'),
      basis: 'roll',
      reason: `At around ${roll} learners a weekly slot fills comfortably, and two contact hours is what the capstone build in each year assumes.`,
    };
  }

  // No roll on file. Say so rather than inventing a reason for the choice.
  return {
    offer: byCode('B2'),
    basis: 'default',
    reason:
      'Our standard recommendation, covering the full progression at the pace each year’s capstone build assumes. Tell us your enrolment and we will re-scope it.',
  };
}

/** "₦25,000–₦30,000 per student per term", or a single figure where the range is flat. */
export function offerPriceLabel(offer: PartnershipOffer): string {
  const money = (n: number) => `₦${n.toLocaleString('en-NG')}`;
  const price =
    offer.priceFrom === offer.priceTo
      ? money(offer.priceFrom)
      : `${money(offer.priceFrom)}–${money(offer.priceTo)}`;
  return `${price} per student per term`;
}
