import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PARTNERSHIP_PHOTOS, REASON_TO_PAY_PHOTO, schoolUpside } from './proposal-sections';

describe('what the programme is worth to the school', () => {
  it('works three uptake levels off the school’s own roll', () => {
    const upside = schoolUpside({ roll: 140, feePerStudent: 25000, sharePercent: 30 });

    expect(upside?.rows.map((r) => r.students)).toEqual([56, 98, 140]);
    // 56 × ₦25,000 = ₦1,400,000 gross; the school's 30% is ₦420,000.
    expect(upside?.rows[0].gross).toBe(1_400_000);
    expect(upside?.rows[0].schoolShare).toBe(420_000);
    expect(upside?.rows[2].schoolShare).toBe(1_050_000);
  });

  it('refuses to project when there is no rate or no share', () => {
    // Without a fee or a split there is no arithmetic to show at any headcount.
    expect(schoolUpside({ roll: 140, feePerStudent: 0, sharePercent: 30 })).toBeNull();
    expect(schoolUpside({ roll: 140, feePerStudent: 25000, sharePercent: 0 })).toBeNull();
    expect(schoolUpside({ roll: 0, feePerStudent: 0, sharePercent: 30 })).toBeNull();
  });

  it('shows common school sizes when the roll is not on file', () => {
    // Nineteen of twenty-nine schools have no student_count. Returning null for
    // them emptied the money page to a single obligations table — on the one
    // page a head teacher rereads.
    const u = schoolUpside({ roll: 0, feePerStudent: 25000, sharePercent: 30 })!;

    expect(u.mode).toBe('illustrative');
    expect(u.rows.map((r) => r.students)).toEqual([100, 200, 300]);
    // 100 × ₦25,000 = ₦2,500,000, of which the school keeps 30%.
    expect(u.rows[0].schoolShare).toBe(750_000);
    // Illustrative sizes are not a total to be added.
    expect(u.total).toBeNull();
  });

  it('never shows a scenario of zero students', () => {
    const upside = schoolUpside({ roll: 1, feePerStudent: 10000, sharePercent: 30 });
    expect(upside?.rows.every((r) => r.students >= 1)).toBe(true);
  });

  it('lists only photographs that are actually on disk', () => {
    // The gallery is the evidence page. A listed file that is not there is a
    // broken frame where the proof should be, on the page just above the
    // signature line — so the list is checked against the filesystem.
    for (const src of PARTNERSHIP_PHOTOS) {
      const onDisk = path.join(process.cwd(), 'public', src.replace(/^\//, ''));
      expect(fs.existsSync(onDisk), `missing: ${src}`).toBe(true);
    }
  });

  it('shows each photograph once, and no more than the gallery renders', () => {
    expect(new Set(PARTNERSHIP_PHOTOS).size).toBe(PARTNERSHIP_PHOTOS.length);
    // The template slices to six; listing more would quietly drop the rest.
    expect(PARTNERSHIP_PHOTOS.length).toBeLessThanOrEqual(6);
  });

  it('uses an events photograph that is actually on disk for the money page', () => {
    const onDisk = path.join(process.cwd(), 'public', REASON_TO_PAY_PHOTO.replace(/^\//, ''));
    expect(fs.existsSync(onDisk), `missing: ${REASON_TO_PAY_PHOTO}`).toBe(true);
    expect(PARTNERSHIP_PHOTOS).not.toContain(REASON_TO_PAY_PHOTO);
  });
});

describe('sections priced separately', () => {
  // The deal as stated: primary ₦15,000 a head, secondary ₦25,000 a head,
  // 70% to Rillcod so 30% to the school, on each section, then added.
  const sections = [
    { label: 'Primary', count: 100, rate: 15000 },
    { label: 'Secondary', count: 60, rate: 25000 },
  ];

  it('takes the share on each section at its own rate', () => {
    const u = schoolUpside({ roll: 160, feePerStudent: 0, sharePercent: 30, sections })!;

    expect(u.mode).toBe('sections');
    // 100 × ₦15,000 = ₦1,500,000, of which the school keeps 30% = ₦450,000.
    expect(u.rows[0]).toMatchObject({ label: 'Primary', students: 100, rate: 15000, gross: 1_500_000, schoolShare: 450_000 });
    // 60 × ₦25,000 = ₦1,500,000, of which the school keeps 30% = ₦450,000.
    expect(u.rows[1]).toMatchObject({ label: 'Secondary', students: 60, rate: 25000, gross: 1_500_000, schoolShare: 450_000 });
  });

  it('adds the sections into a total', () => {
    const u = schoolUpside({ roll: 160, feePerStudent: 0, sharePercent: 30, sections })!;

    expect(u.total).toMatchObject({ students: 160, gross: 3_000_000, schoolShare: 900_000 });
  });

  it('never blends the rates into an average', () => {
    const u = schoolUpside({ roll: 160, feePerStudent: 0, sharePercent: 30, sections })!;

    // The average here would be ₦18,750 — a number the school has never been
    // quoted and would not recognise. Only the agreed rates appear.
    expect(u.feePerStudent).toBe(0);
    expect(u.rows.map((r) => r.rate)).toEqual([15000, 25000]);
  });

  it('adding the sections equals taking the share on the whole', () => {
    const u = schoolUpside({ roll: 160, feePerStudent: 0, sharePercent: 30, sections })!;
    const summed = u.rows.reduce((n, r) => n + r.schoolShare, 0);
    const onWhole = Math.round((u.rows.reduce((n, r) => n + r.gross, 0) * 30) / 100);

    expect(summed).toBe(onWhole);
    expect(u.total!.schoolShare).toBe(summed);
  });

  it('ignores a section with no headcount or no rate', () => {
    const u = schoolUpside({
      roll: 100, feePerStudent: 0, sharePercent: 30,
      sections: [{ label: 'Primary', count: 100, rate: 15000 }, { label: 'Nursery', count: 0, rate: 9000 }],
    })!;

    expect(u.rows).toHaveLength(1);
    expect(u.total!.students).toBe(100);
  });

  it('a fixed package is one row and no total to add', () => {
    const u = schoolUpside({ roll: 150, feePerStudent: 0, sharePercent: 30, fixedPackage: 1_500_000 })!;

    expect(u.mode).toBe('package');
    expect(u.rows).toHaveLength(1);
    expect(u.rows[0].schoolShare).toBe(450_000);
    expect(u.total).toBeNull();
  });
});

describe('the whole menu, when no option has been picked', () => {
  const menuOffers = [
    { code: 'A', priceFrom: 25000 },
    { code: 'B1', priceFrom: 10000 },
    { code: 'B2', priceFrom: 15000 },
  ];

  it('compares A, B1 and B2 at the school roll rather than inventing Option A', () => {
    const u = schoolUpside({
      roll: 150,
      feePerStudent: 0,
      sharePercent: 30,
      menuOffers,
    })!;

    expect(u.mode).toBe('menu');
    expect(u.rows.map((r) => r.label)).toEqual(['Option A', 'Option B1', 'Option B2']);
    expect(u.rows.every((r) => r.students === 150)).toBe(true);
    // 150 × ₦10,000 = ₦1,500,000, of which the school keeps 30%.
    expect(u.rows[1]).toMatchObject({ rate: 10000, gross: 1_500_000, schoolShare: 450_000 });
    // Option A's floor, not treated as the quote.
    expect(u.rows[0].rate).toBe(25000);
    expect(u.total).toBeNull();
  });

  it('uses a round headcount when the roll is not on file', () => {
    const u = schoolUpside({
      roll: 0,
      feePerStudent: 0,
      sharePercent: 30,
      menuOffers,
    })!;

    expect(u.mode).toBe('menu');
    expect(u.rows.every((r) => r.students === 200)).toBe(true);
    // 200 × ₦25,000 = ₦5,000,000, of which the school keeps 30%.
    expect(u.rows[0].schoolShare).toBe(1_500_000);
  });

  it('still refuses when there is neither a fee nor a menu', () => {
    expect(schoolUpside({ roll: 140, feePerStudent: 0, sharePercent: 30 })).toBeNull();
  });
});
