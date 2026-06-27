// Shared academic-period helpers for the report builder + results views, so term/
// year logic isn't duplicated and re-derived inconsistently across the two large
// page components. Nigerian school calendar: Sept–Aug, three terms.

// Terms in natural calendar order (used to populate dropdowns AND to sort reports).
export const ACADEMIC_TERM_OPTIONS = ['First Term', 'Second Term', 'Third Term', 'Mid-Term', 'Termly', 'Annual'] as const;

// Chronological rank within a session. First < Second < Third; the non-positional
// labels sort after the three real terms but stay stable relative to each other.
const TERM_RANK: Record<string, number> = {
  'first term': 1, 'mid-term': 1.5, 'second term': 2, 'third term': 3,
  'termly': 4, 'annual': 5,
};
export function termRank(term: string | null | undefined): number {
  return TERM_RANK[(term ?? '').trim().toLowerCase()] ?? 0;
}

// Starting calendar year of an academic session string like "2025/2026" → 2025.
// Unparseable / empty periods sort oldest so dated reports surface first.
export function academicYearStart(period: string | null | undefined): number {
  const m = (period ?? '').match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : 0;
}

type ReportLike = {
  report_term?: string | null;
  report_period?: string | null;
  is_published?: boolean | null;
  updated_at?: string | null;
};

// Newest-first chronological order: latest academic year, then latest term, then
// published above draft, then most recently updated. Use this everywhere a list of a
// student's reports is shown so every user sees them consistently ordered by
// academic year + term — not by whichever was last edited.
export function compareReportsByPeriodDesc(a: ReportLike, b: ReportLike): number {
  const yearDiff = academicYearStart(b.report_period) - academicYearStart(a.report_period);
  if (yearDiff !== 0) return yearDiff;
  const termDiff = termRank(b.report_term) - termRank(a.report_term);
  if (termDiff !== 0) return termDiff;
  const pubDiff = Number(b.is_published ?? false) - Number(a.is_published ?? false);
  if (pubDiff !== 0) return pubDiff;
  return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
}

// Current term from the calendar month: Sept–Dec → First, May–Aug → Third, else Second.
export function getCurrentTermLabel(): string {
  const m = new Date().getMonth() + 1;
  if (m >= 9) return 'First Term';
  if (m >= 5) return 'Third Term';
  return 'Second Term';
}

// Current academic session string on the Sept–Aug calendar (e.g. "2025/2026").
export function getCurrentAcademicYear(): string {
  const now = new Date();
  return now.getMonth() + 1 >= 9
    ? `${now.getFullYear()}/${now.getFullYear() + 1}`
    : `${now.getFullYear() - 1}/${now.getFullYear()}`;
}

// Academic-year choices for selectors — previous session through a few ahead, always
// generated from today so they never go stale (unlike a hardcoded preset list).
export function academicYearOptions(): string[] {
  const base = new Date().getMonth() + 1 >= 9 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  return [base - 1, base, base + 1, base + 2, base + 3].map(y => `${y}/${y + 1}`);
}
