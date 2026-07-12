/**
 * Term-aware helpers for partner-school invoices.
 * One active (non-cancelled) school invoice per school + academic_year + term.
 */

export type SchoolTermKey = {
  schoolId: string;
  academicYear: string;
  termNumber: string;
};

export function extractSchoolTermFromMetadata(
  metadata: unknown,
): { academicYear: string; termNumber: string } | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const m = metadata as Record<string, unknown>;
  const academicYear = m.academic_year != null ? String(m.academic_year).trim() : '';
  const termNumber = m.term_number != null ? String(m.term_number).trim() : '';
  if (!academicYear || !termNumber) return null;
  if (!['1', '2', '3'].includes(termNumber)) return null;
  return { academicYear, termNumber };
}

export function schoolTermLabel(academicYear: string, termNumber: string): string {
  const ordinal = termNumber === '1' ? 'First' : termNumber === '2' ? 'Second' : 'Third';
  return `${ordinal} Term ${academicYear}`;
}
