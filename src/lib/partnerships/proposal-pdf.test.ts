import { describe, expect, it } from 'vitest';
import { fitPageToSheet } from './proposal-pdf';

/*
  The emailed copy may not be a cropped copy.

  The PDF is built in the browser by capturing each `.page` and placing it on an
  A4 sheet. Both halves of that used to be hard-coded to one sheet exactly, so a
  page that ran long came back already cut and was then placed as though nothing
  had happened — losing the end of it in the file a school actually receives,
  silently. Printing was fixed to let a long page take another sheet; this holds
  the same promise on the delivery path, by scaling rather than cutting.
*/
describe('placing a captured page on its sheet', () => {
  const A4 = { w: 794, h: 1123 };

  it('places an ordinary page at full size, edge to edge', () => {
    const fit = fitPageToSheet(A4.h);
    expect(fit).toEqual({ width: A4.w, height: A4.h, x: 0, y: 0, scaled: false });
  });

  it('does not stretch a page that came up short', () => {
    // Nothing renders shorter than a sheet — the templates set a minimum — but
    // if one did, blowing it up to fill A4 would resize the type on that page.
    const fit = fitPageToSheet(900);
    expect(fit.scaled).toBe(false);
    expect(fit.height).toBe(A4.h);
  });

  it('scales a long page down to the sheet instead of cutting it', () => {
    const fit = fitPageToSheet(1300);
    expect(fit.scaled).toBe(true);
    expect(fit.height).toBe(A4.h);
    // The whole width still fits, and the page is centred in what is left.
    expect(fit.width).toBeLessThan(A4.w);
    expect(fit.x).toBeGreaterThan(0);
    expect(fit.x * 2 + fit.width).toBeCloseTo(A4.w, 5);
  });

  it('keeps the page in proportion, so nothing is squashed', () => {
    const height = 1400;
    const fit = fitPageToSheet(height);
    // Same aspect ratio going in as coming out.
    expect(fit.width / fit.height).toBeCloseTo(A4.w / height, 5);
  });

  it('survives a height it cannot read', () => {
    expect(fitPageToSheet(0).height).toBe(A4.h);
    expect(fitPageToSheet(Number.NaN).scaled).toBe(false);
  });
});
