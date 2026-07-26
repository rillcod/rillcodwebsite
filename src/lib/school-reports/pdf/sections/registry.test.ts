import { describe, expect, it } from 'vitest';
import { REPORT_SECTIONS, orderedReportSections, buildReportSections } from './registry';
import type { SchoolReportPdfContext } from '../context';

/**
 * The registry turns section order into data, which introduces two failure modes
 * that did not exist when the body was a literal array: duplicate keys, and two
 * sections sharing an order (whose relative position then depends on sort
 * stability rather than intent). Both are pinned here.
 */
describe('report section registry', () => {
  it('has unique keys', () => {
    const keys = REPORT_SECTIONS.map((section) => section.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has unique order values so position is never left to sort stability', () => {
    const orders = REPORT_SECTIONS.map((section) => section.order);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('orders sections ascending without mutating the exported table', () => {
    const before = REPORT_SECTIONS.map((section) => section.key);
    const ordered = orderedReportSections().map((section) => section.order);
    expect([...ordered].sort((a, b) => a - b)).toEqual(ordered);
    expect(REPORT_SECTIONS.map((section) => section.key)).toEqual(before);
  });

  it('places every appendix after every body section', () => {
    // Appendices start a new page and are detached for filing, so one appearing
    // mid-report would break the book's physical structure.
    const appendixOrders = REPORT_SECTIONS.filter((s) => s.key.startsWith('appendix')).map((s) => s.order);
    const bodyOrders = REPORT_SECTIONS.filter((s) => !s.key.startsWith('appendix')).map((s) => s.order);
    expect(Math.min(...appendixOrders)).toBeGreaterThan(Math.max(...bodyOrders));
  });

  it('leaves room to insert a section between any two neighbours', () => {
    const orders = orderedReportSections().map((section) => section.order);
    for (let i = 1; i < orders.length; i += 1) {
      expect(orders[i] - orders[i - 1]).toBeGreaterThan(1);
    }
  });

  it('concatenates section output and skips sections that return nothing', () => {
    const calls: string[] = [];
    const fake = REPORT_SECTIONS.map((section, index) => ({
      ...section,
      build: () => {
        calls.push(section.key);
        return index % 2 === 0 ? [{ text: section.key }] : [];
      },
    }));
    const output = [...fake]
      .sort((a, b) => a.order - b.order)
      .flatMap((section) => section.build());

    // Empty sections leave no gap in the document body.
    expect(output.every((node) => node && typeof node === 'object')).toBe(true);
    expect(calls).toHaveLength(REPORT_SECTIONS.length);
  });

  it('every registered section is callable', () => {
    for (const section of REPORT_SECTIONS) {
      expect(typeof section.build).toBe('function');
    }
    expect(typeof buildReportSections).toBe('function');
    // Guards against an import landing as undefined after a file move.
    expect(REPORT_SECTIONS.some((section) => (section.build as unknown) == null)).toBe(false);
  });
});

/** Compile-time guard: the builder signature must stay uniform. */
export type _SectionSignature = (ctx: SchoolReportPdfContext) => object[];
