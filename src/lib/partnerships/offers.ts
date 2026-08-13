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

/** "₦25,000–₦30,000 per student per term", or a single figure where the range is flat. */
export function offerPriceLabel(offer: PartnershipOffer): string {
  const money = (n: number) => `₦${n.toLocaleString('en-NG')}`;
  const price =
    offer.priceFrom === offer.priceTo
      ? money(offer.priceFrom)
      : `${money(offer.priceFrom)}–${money(offer.priceTo)}`;
  return `${price} per student per term`;
}
