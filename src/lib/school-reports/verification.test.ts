import { describe, expect, it } from 'vitest';
import {
  formatHumanReportReference,
  schoolReportVerificationCode,
  schoolReportVerificationUrl,
  termNumberFromLabel,
} from './verification';

describe('school report verification', () => {
  it('creates a stable non-sequential public code', () => {
    expect(schoolReportVerificationCode('report-1')).toMatch(/^SR-[A-F0-9]{20}$/);
    expect(schoolReportVerificationCode('report-1')).toBe(schoolReportVerificationCode('report-1'));
    expect(schoolReportVerificationUrl('report-1')).toContain(schoolReportVerificationCode('report-1'));
  });
});

/**
 * The short reference is what a bursar files under and reads down a telephone.
 * It defaulted to "2026" and term one for every report, so a second-term report
 * from 2027 announced itself as RC-REP-2026-T1 — wrong about the only two facts
 * it carries.
 */
describe('the human-readable report reference', () => {
  it('names the year and term the report actually covers', () => {
    expect(formatHumanReportReference('r1', '2027/2028', 2)).toMatch(/^RC-REP-2027-T2-[A-F0-9]{4}$/);
  });

  it('is stable for a report, and differs between reports', () => {
    expect(formatHumanReportReference('r1', '2026/2027', 1)).toBe(
      formatHumanReportReference('r1', '2026/2027', 1),
    );
    expect(formatHumanReportReference('r1', '2026/2027', 1)).not.toBe(
      formatHumanReportReference('r2', '2026/2027', 1),
    );
  });

  it('never prints a term outside one to three', () => {
    // A bad number would otherwise reach the page as "T7" or "TNaN".
    expect(formatHumanReportReference('r1', '2026', 0)).toContain('-T1-');
    expect(formatHumanReportReference('r1', '2026', 9)).toContain('-T1-');
    expect(formatHumanReportReference('r1', '2026', NaN)).toContain('-T1-');
  });

  it('reads the term number out of however the label was typed', () => {
    for (const [label, n] of [
      ['First Term', 1], ['1st Term', 1], ['Term 1', 1],
      ['Second Term', 2], ['Term 2', 2],
      ['Third Term', 3], ['3rd Term', 3],
    ] as const) {
      expect(termNumberFromLabel(label)).toBe(n);
    }
  });

  it('falls back to term one rather than printing nonsense', () => {
    expect(termNumberFromLabel('')).toBe(1);
    expect(termNumberFromLabel(null)).toBe(1);
    expect(termNumberFromLabel('Summer Intensive')).toBe(1);
  });

  it('stays separate from the verification key', () => {
    // The long code is what the verify endpoint matches on. If these ever became
    // the same string, a reference read aloud would be a credential.
    const ref = formatHumanReportReference('r1', '2026', 1);
    expect(ref).not.toBe(schoolReportVerificationCode('r1'));
    expect(ref.startsWith('SR-')).toBe(false);
  });
});
