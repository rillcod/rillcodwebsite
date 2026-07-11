import { cleanGrade } from '@/lib/classes/naming';

// Canonical school-grade tokens accepted in pasted bulk-registration text.
// The final optional letter/number is the arm and is stored separately.
const BULK_GRADE_RE =
  /\b((?:NURSERY|NUR|KINDERGARTEN|KG|RECEPTION|BASIC|PRIMARY|PRY|GRADE|JSS|JS|SSS|SS)\s*[1-6])\s*([A-D])?\b/i;

export type ParsedBulkGrade = {
  grade: string;
  arm: string | null;
};

export function parseBulkGrade(text: string): ParsedBulkGrade | null {
  const match = text.match(BULK_GRADE_RE);
  if (!match) return null;
  const grade = cleanGrade(match[1]);
  if (!grade) return null;
  return { grade, arm: match[2]?.toUpperCase() ?? null };
}

export function isBulkGradeHeader(line: string): boolean {
  const clean = line.trim().replace(/[:\-–—.]/g, '').trim();
  return !!parseBulkGrade(clean) && clean.replace(BULK_GRADE_RE, '').trim() === '';
}

export function stripBulkGrade(text: string): string {
  return text.replace(BULK_GRADE_RE, '').replace(/\s{2,}/g, ' ').trim();
}

