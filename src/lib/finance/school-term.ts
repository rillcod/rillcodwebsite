/**
 * Term-aware helpers for partner-school invoices.
 * One active (non-cancelled) school invoice per school + academic_year + term.
 *
 * Storage convention (legacy-compatible):
 *   metadata.academic_year = session-start year as string/number ("2025")
 *   metadata.term_number   = "1" | "2" | "3"
 * Display / notes always use the full period via academic-period helpers so
 * Second/Third and consecutive years stay distinct.
 */

import {
  labelFromTermNumber,
  periodFromStartYear,
  periodStartYear,
  schoolSessionDisplay,
  termNumberFromLabel,
  liveSchoolTermRef,
} from '@/lib/reports/academic-period';

export type SchoolTermKey = {
  schoolId: string;
  academicYear: string;
  termNumber: string;
};

export type NormalizedSchoolTerm = {
  /** Start year "2025" — used in metadata filters. */
  academicYear: string;
  termNumber: '1' | '2' | '3';
  /** Canonical "2025/2026". */
  periodLabel: string;
  /** Positional "Third Term". */
  termLabel: string;
};

function periodFromCombinedLabel(label: string): string {
  const m = label.match(/(\d{4}\s*\/\s*\d{4})/);
  return m ? periodFromStartYear(m[1].replace(/\s+/g, '')) : '';
}

export function extractSchoolTermFromMetadata(
  metadata: unknown,
): NormalizedSchoolTerm | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const m = metadata as Record<string, unknown>;
  const displayLabel = m.term_label != null ? String(m.term_label).trim() : '';

  // Prefer explicit period_label, then academic_year, then a combined display label.
  const periodRaw =
    m.period_label != null
      ? String(m.period_label).trim()
      : m.academic_year != null
        ? String(m.academic_year).trim()
        : periodFromCombinedLabel(displayLabel);
  const periodLabel = periodFromStartYear(periodRaw) || periodFromCombinedLabel(displayLabel);
  if (!periodLabel) return null;

  let termNumber: '1' | '2' | '3' | null = null;
  if (m.term_number != null && ['1', '2', '3'].includes(String(m.term_number).trim())) {
    termNumber = String(m.term_number).trim() as '1' | '2' | '3';
  } else if (displayLabel) {
    termNumber = termNumberFromLabel(displayLabel);
  }
  if (!termNumber) return null;

  return {
    academicYear: periodStartYear(periodLabel),
    termNumber,
    periodLabel,
    termLabel: labelFromTermNumber(termNumber),
  };
}

/** Whether two finance term keys refer to the same session (normalizes "2025" vs "2025/2026"). */
export function schoolTermsEqual(
  a: { academicYear: string; termNumber: string },
  b: { academicYear: string; termNumber: string },
): boolean {
  const pa = periodFromStartYear(a.academicYear);
  const pb = periodFromStartYear(b.academicYear);
  return !!pa && pa === pb && String(a.termNumber) === String(b.termNumber);
}

/** @deprecated Prefer schoolSessionDisplay — kept for call-site compatibility. */
export function schoolTermLabel(academicYear: string, termNumber: string): string {
  return schoolSessionDisplay(academicYear, termNumber);
}

/** Metadata blob for new school invoices — past/present/future stay separable. */
export function buildSchoolTermMetadata(
  academicYearOrPeriod: string | number,
  termNumber: string | number,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const periodLabel = periodFromStartYear(academicYearOrPeriod);
  const num = String(termNumber).trim() as '1' | '2' | '3';
  const termLabel = labelFromTermNumber(num);
  return {
    academic_year: periodStartYear(periodLabel) ? Number(periodStartYear(periodLabel)) : academicYearOrPeriod,
    term_number: Number(num),
    period_label: periodLabel,
    term_label: schoolSessionDisplay(periodLabel, num),
    term_label_short: termLabel,
    ...extra,
  };
}

export { liveSchoolTermRef, schoolSessionDisplay };
