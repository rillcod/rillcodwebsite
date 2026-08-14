import { describe, expect, it } from 'vitest';
import { PARTNERSHIP_PHOTOS, schoolUpside } from './proposal-sections';

describe('what the programme is worth to the school', () => {
  it('works three uptake levels off the school’s own roll', () => {
    const upside = schoolUpside({ roll: 140, feePerStudent: 25000, sharePercent: 30 });

    expect(upside?.rows.map((r) => r.students)).toEqual([56, 98, 140]);
    // 56 × ₦25,000 = ₦1,400,000 gross; the school's 30% is ₦420,000.
    expect(upside?.rows[0].gross).toBe(1_400_000);
    expect(upside?.rows[0].schoolShare).toBe(420_000);
    expect(upside?.rows[2].schoolShare).toBe(1_050_000);
  });

  it('refuses to project when there is nothing honest to project from', () => {
    // A forecast built on a guessed headcount is one we would have to defend.
    expect(schoolUpside({ roll: 0, feePerStudent: 25000, sharePercent: 30 })).toBeNull();
    expect(schoolUpside({ roll: 140, feePerStudent: 0, sharePercent: 30 })).toBeNull();
    expect(schoolUpside({ roll: 140, feePerStudent: 25000, sharePercent: 0 })).toBeNull();
  });

  it('never shows a scenario of zero students', () => {
    const upside = schoolUpside({ roll: 1, feePerStudent: 10000, sharePercent: 30 });
    expect(upside?.rows.every((r) => r.students >= 1)).toBe(true);
  });

  it('ships with no photographs rather than broken image boxes', () => {
    // The gallery is opt-in: a proposal must never go out with an empty frame
    // where the evidence is supposed to be.
    expect(PARTNERSHIP_PHOTOS).toHaveLength(0);
  });
});
