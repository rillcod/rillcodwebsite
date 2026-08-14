import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { countSchoolsAwaitingTerms, resolveBillingRate } from './billing-rate';
import { MissingPartnershipTermsError } from './terms';
import { splitSchoolAmount } from '@/lib/finance/streams';

const SHARE = {
  id: 't1', school_id: 's1', billing_model: 'per_student', currency: 'NGN', billing_cycle: 'term',
  amount_per_student: 30000, fixed_package_price: null, tiers: null, deposit_amount: null,
  rillcod_share_percent: 70, school_share_percent: 30, status: 'agreed',
};

/** Terms with no split — the school pays an agreed rate, it is not shared. */
const FLAT = { ...SHARE, rillcod_share_percent: null, school_share_percent: null };

function db(terms: Record<string, unknown> | null) {
  const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: terms }) };
  return { from: () => chain };
}

const previous = process.env.PARTNERSHIP_TERMS_REQUIRED;

beforeEach(() => {
  delete process.env.PARTNERSHIP_TERMS_REQUIRED;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  if (previous === undefined) delete process.env.PARTNERSHIP_TERMS_REQUIRED;
  else process.env.PARTNERSHIP_TERMS_REQUIRED = previous;
});

describe('a school on a revenue share', () => {
  it('bills at the agreed share, not a default', async () => {
    const r = await resolveBillingRate(db(SHARE), { id: 's1', name: 'Bay-Flowers', commission_rate: 15 });

    expect(r.rate).toBe(70);
    expect(r.source).toBe('agreed_terms');
    expect(r.provisional).toBe(false);
  });

  it('leaves the school the smaller share', async () => {
    const r = await resolveBillingRate(db(SHARE), { id: 's1', commission_rate: 15 });
    const split = splitSchoolAmount(3_000_000, r.rate);

    expect(split.rillcodRetain).toBe(2_100_000);
    expect(split.schoolSettlement).toBe(900_000);
  });
});

describe('a school on a fixed amount or rate', () => {
  it('treats the whole invoice as Rillcod’s, not a 0% share', async () => {
    // Some schools agree a flat rate rather than a split. The invoiced amount is
    // then wholly Rillcod's — 100, not 0. The invoice builder prefills 0 here
    // because every school row carries rillcod_quota_percent = 0 and `??` reads
    // 0 as a value, which would hand the school the entire invoice.
    const r = await resolveBillingRate(db(FLAT), { id: 's1', name: 'Word of Faith', commission_rate: 15 });

    expect(r.rate).toBe(100);
    expect(r.source).toBe('agreed_terms');
    expect(r.provisional).toBe(false);

    const split = splitSchoolAmount(1_000_000, r.rate);
    expect(split.rillcodRetain).toBe(1_000_000);
    expect(split.schoolSettlement).toBe(0);
  });

  it('ignores the legacy column once a flat rate is agreed', async () => {
    const r = await resolveBillingRate(db(FLAT), { id: 's1', commission_rate: 15 });
    expect(r.rate).not.toBe(15);
  });
});

describe('the grace period', () => {
  it('honours the school’s legacy rate, and says it is provisional', async () => {
    const r = await resolveBillingRate(db(null), { id: 's1', name: 'Megamind', commission_rate: 40 });

    expect(r.rate).toBe(40);
    expect(r.source).toBe('legacy_school_rate');
    expect(r.provisional).toBe(true);
    expect(r.terms).toBeNull();
  });

  it('falls back to the 15% constant when even that is missing', async () => {
    const r = await resolveBillingRate(db(null), { id: 's1', name: 'Quincy', commission_rate: null });

    expect(r.rate).toBe(15);
    expect(r.source).toBe('legacy_default');
    expect(r.provisional).toBe(true);
  });

  it('warns by name every time a legacy rate is used', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warn.mockClear();

    await resolveBillingRate(db(null), { id: 's1', name: 'Megamind Academy', commission_rate: 15 });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('Megamind Academy');
    expect(String(warn.mock.calls[0][0])).toContain('no agreed partnership terms');
  });

  it('never invoices silently — invoicing keeps working meanwhile', async () => {
    // The point of the grace period: all 29 schools still bill while their real
    // rates are recorded, rather than every invoice stopping at once.
    const r = await resolveBillingRate(db(null), { id: 's1', commission_rate: 15 });
    expect(r.rate).toBeGreaterThan(0);
  });
});

describe('closing the grace period', () => {
  it('refuses to guess once terms are required', async () => {
    process.env.PARTNERSHIP_TERMS_REQUIRED = '1';

    await expect(
      resolveBillingRate(db(null), { id: 's1', name: 'Megamind Academy', commission_rate: 15 }),
    ).rejects.toThrow(MissingPartnershipTermsError);
  });

  it('still bills a school that has terms', async () => {
    process.env.PARTNERSHIP_TERMS_REQUIRED = '1';

    const r = await resolveBillingRate(db(SHARE), { id: 's1', commission_rate: 15 });
    expect(r.rate).toBe(70);
  });
});

describe('watching the gap close', () => {
  it('counts the schools still on a legacy rate', async () => {
    const stub = {
      from(table: string) {
        const chain: any = {
          select: () => chain,
          neq: () => chain,
          eq: () => chain,
          order: async () => ({
            data: [
              { id: 'a', name: 'Alpha' },
              { id: 'b', name: 'Bravo' },
              { id: 'c', name: 'Charlie' },
            ],
          }),
        };
        if (table === 'partnership_terms') {
          chain.eq = async () => ({ data: [{ school_id: 'b' }] });
        }
        return chain;
      },
    };

    const gap = await countSchoolsAwaitingTerms(stub as any);

    expect(gap.total).toBe(3);
    expect(gap.withTerms).toBe(1);
    expect(gap.awaiting).toBe(2);
    expect(gap.schools.map((s) => s.name)).toEqual(['Alpha', 'Charlie']);
  });

  it('counts partners, not the prospecting pipeline', async () => {
    // A prospect entered to be pitched at is not billed on a legacy rate — it is
    // not billed at all. Counting it would make this number climb every time
    // somebody adds a school to pitch, so it could never reach the zero that
    // closes the grace period.
    const filters: Array<[string, unknown]> = [];
    const stub = {
      from(table: string) {
        const chain: any = {
          select: () => chain,
          neq: () => chain,
          eq: (col: string, val: unknown) => {
            if (table === 'schools') filters.push([col, val]);
            return chain;
          },
          order: async () => ({ data: [{ id: 'a', name: 'Alpha' }] }),
        };
        if (table === 'partnership_terms') {
          chain.eq = async () => ({ data: [] });
        }
        return chain;
      },
    };

    await countSchoolsAwaitingTerms(stub as any);

    expect(filters).toContainEqual(['status', 'approved']);
  });
});
