import { describe, expect, it } from 'vitest';
import {
  MissingPartnershipTermsError,
  computeCharge,
  describeTerms,
  normaliseTerms,
  requireAgreedTerms,
  type PartnershipTerms,
} from './terms';

const base: PartnershipTerms = {
  id: 'terms-1',
  school_id: 'school-1',
  billing_model: 'per_student',
  currency: 'NGN',
  billing_cycle: 'term',
  amount_per_student: 30000,
  fixed_package_price: null,
  tiers: null,
  deposit_amount: null,
  rillcod_share_percent: 70,
  school_share_percent: 30,
  status: 'agreed',
};

/** Minimal Supabase stub: only the chain getAgreedTerms actually walks. */
function db(row: Record<string, unknown> | null) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: row }),
  };
  return { from: () => chain };
}

describe('the Bay-Flowers deal', () => {
  it('charges per student and splits that revenue — both, not either', () => {
    const c = computeCharge(base, 100);

    expect(c.subtotal).toBe(3_000_000);
    expect(c.rillcodRetain).toBe(2_100_000);
    expect(c.schoolSettlement).toBe(900_000);
    expect(c.sharePercent).toBe(70);
  });

  it('states the deal in one sentence documents can print', () => {
    expect(describeTerms(base)).toBe(
      '₦30,000 per student per term, shared Rillcod 70% / school 30%',
    );
  });

  it('gives Rillcod the larger share — the direction the README got backwards', () => {
    const c = computeCharge(base, 100);
    expect(c.rillcodRetain).toBeGreaterThan(c.schoolSettlement);
  });
});

describe('a flat agreed rate', () => {
  const flat: PartnershipTerms = {
    ...base,
    amount_per_student: 25000,
    rillcod_share_percent: null,
    school_share_percent: null,
  };

  it('treats the whole amount as Rillcod’s, not a 0% share', () => {
    const c = computeCharge(flat, 40);

    // The invoice builder prefilled 0% here because every school row carries
    // rillcod_quota_percent = 0 and `??` only falls through on null. Reporting
    // 0 would hand the school the entire invoice.
    expect(c.subtotal).toBe(1_000_000);
    expect(c.rillcodRetain).toBe(1_000_000);
    expect(c.schoolSettlement).toBe(0);
    expect(c.sharePercent).toBe(100);
    expect(c.revenueShareOn).toBe(false);
  });

  it('omits a split it does not have', () => {
    expect(describeTerms(flat)).toBe('₦25,000 per student per term');
  });
});

describe('other agreed shapes', () => {
  it('bills a fixed package regardless of headcount', () => {
    const fixed: PartnershipTerms = {
      ...base,
      billing_model: 'fixed_package',
      amount_per_student: null,
      fixed_package_price: 1_500_000,
    };

    expect(computeCharge(fixed, 0).subtotal).toBe(1_500_000);
    expect(computeCharge(fixed, 500).subtotal).toBe(1_500_000);
  });

  it('sums population bands from the tiers themselves', () => {
    const tiered: PartnershipTerms = {
      ...base,
      billing_model: 'tiered',
      amount_per_student: null,
      rillcod_share_percent: null,
      school_share_percent: null,
      tiers: [
        { label: 'First 100', count: 100, rate: 30000 },
        { label: 'Next 150', count: 150, rate: 25000 },
      ],
    };

    // A band carries its own count, so the passed headcount is not used.
    expect(computeCharge(tiered, 9999).subtotal).toBe(6_750_000);
  });

  it('takes the deposit off the balance without changing the split', () => {
    const withDeposit: PartnershipTerms = { ...base, deposit_amount: 500_000 };
    const c = computeCharge(withDeposit, 100);

    expect(c.subtotal).toBe(3_000_000);
    expect(c.deposit).toBe(500_000);
    expect(c.balance).toBe(2_500_000);
    expect(c.rillcodRetain).toBe(2_100_000);
  });

  it('never lets a deposit exceed what is owed', () => {
    const overpaid: PartnershipTerms = { ...base, deposit_amount: 99_000_000 };
    const c = computeCharge(overpaid, 1);

    expect(c.deposit).toBe(30_000);
    expect(c.balance).toBe(0);
  });
});

describe('a school with no agreed terms', () => {
  it('refuses to bill rather than falling back to a default', async () => {
    // The whole point: no rate is safe to guess when every deal is negotiated.
    await expect(requireAgreedTerms(db(null), 'school-9', 'Megamind Academy')).rejects.toThrow(
      MissingPartnershipTermsError,
    );
  });

  it('names the school so the message is actionable', async () => {
    await expect(
      requireAgreedTerms(db(null), 'school-9', 'Megamind Academy'),
    ).rejects.toThrow(/Megamind Academy has no agreed partnership terms/);
  });

  it('returns the agreed row when there is one', async () => {
    const terms = await requireAgreedTerms(db({ ...base }), 'school-1');
    expect(terms.amount_per_student).toBe(30000);
    expect(terms.rillcod_share_percent).toBe(70);
  });
});

describe('normalising a database row', () => {
  it('drops a tier list that is not a list', () => {
    expect(normaliseTerms({ ...base, tiers: 'nonsense' })?.tiers).toBeNull();
    expect(normaliseTerms({ ...base, tiers: [] })?.tiers).toBeNull();
  });

  it('keeps a zero share distinguishable from an absent one', () => {
    // 0 is not a legal agreed share, but it must not silently become null and
    // read as "no split" — that is the same class of bug as `?? `on a 0.
    expect(normaliseTerms({ ...base, rillcod_share_percent: 0 })?.rillcod_share_percent).toBe(0);
    expect(normaliseTerms({ ...base, rillcod_share_percent: null })?.rillcod_share_percent).toBeNull();
  });

  it('is null for an empty row', () => {
    expect(normaliseTerms(null)).toBeNull();
    expect(normaliseTerms({})).toBeNull();
  });
});
