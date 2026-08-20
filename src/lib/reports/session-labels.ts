import { normalizePeriodLabel, normalizeTermLabel } from '@/lib/reports/academic-period';

const PLACEHOLDER_TERMS = new Set([
  'current learning period',
  'academic period to be confirmed',
  'current programme',
  'current program',
]);

const PLACEHOLDER_PERIODS = new Set([
  'current programme',
  'current program',
  'current learning period',
]);

/** Legacy Auto-fill labels that must not become the canonical session identity. */
export function isPlaceholderReportSession(
  term?: string | null,
  period?: string | null,
): boolean {
  const t = normalizeTermLabel(term).toLowerCase();
  const p = normalizePeriodLabel(period).toLowerCase();
  if (!t && !p) return true;
  if (t && PLACEHOLDER_TERMS.has(t)) return true;
  if (p && PLACEHOLDER_PERIODS.has(p)) return true;
  if (p.includes(' to ') && !/\d{4}/.test(p)) return true;
  return false;
}

type AcademicTermRow = {
  term_label?: string | null;
  academic_year?: string | null;
};

type OfferingPeriodRow = {
  label?: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
};

/**
 * Bind a learner report to the class academic term when one exists.
 * Special programmes and termly schools share the same canonical labels.
 */
export function resolveClassReportSession(input: {
  academicTerm?: AcademicTermRow | null;
  termId?: string | null;
  offeringPeriod?: OfferingPeriodRow | null;
  offeringTitle?: string | null;
  isTermly?: boolean;
}): {
  report_term: string;
  report_period: string;
  term_id: string | null;
} {
  const termRow = input.academicTerm;
  if (termRow?.term_label && termRow?.academic_year) {
    return {
      report_term: normalizeTermLabel(termRow.term_label),
      report_period: normalizePeriodLabel(termRow.academic_year),
      term_id: input.termId ?? null,
    };
  }

  const period = input.offeringPeriod;
  const offeringTitle = String(input.offeringTitle || '').trim();
  if (input.isTermly) {
    return {
      report_term: normalizeTermLabel(termRow?.term_label) || 'Current learning period',
      report_period: normalizePeriodLabel(termRow?.academic_year) || 'Current programme',
      term_id: input.termId ?? null,
    };
  }

  const range = [period?.starts_on, period?.ends_on].filter(Boolean).join(' to ');
  return {
    report_term: normalizeTermLabel(period?.label) || offeringTitle || 'Current learning period',
    report_period: normalizePeriodLabel(range) || offeringTitle || 'Current programme',
    term_id: input.termId ?? null,
  };
}
