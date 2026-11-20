import { canonicalGrade } from '@/lib/classes/naming';

const GENERIC_SCHOOL_WORDS = new Set([
  'school', 'schools', 'sch', 'academy', 'college', 'secondary', 'sec',
  'primary', 'pry', 'nursery', 'basic', 'high', 'junior', 'senior',
  'international', 'intl', 'int', 'montessori', 'preparatory', 'prep',
  'comprehensive', 'grammar', 'model', 'memorial', 'foundation', 'group',
  'campus', 'annex', 'branch', 'centre', 'center', 'institute', 'of', 'the',
  'and', 'for', 'ltd', 'limited',
]);

/**
 * Extracts the distinctive brand root of a school name so sister branches
 * like "Quincy Academy" and "Quincy Secondary School" resolve to "quincy".
 */
export function extractSchoolBrandRoot(schoolName: string | null | undefined): string | null {
  if (!schoolName) return null;
  const tokens = schoolName
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !GENERIC_SCHOOL_WORDS.has(t));

  if (tokens.length === 0) return null;
  const root = tokens.join(' ').trim();
  return root.length >= 4 ? root : null;
}

/**
 * Returns true when two distinct schools belong to the same school group
 * (e.g. "Quincy Academy" and "Quincy Secondary").
 */
export function areSisterSchools(
  schoolNameA: string | null | undefined,
  schoolNameB: string | null | undefined,
): boolean {
  const rootA = extractSchoolBrandRoot(schoolNameA);
  const rootB = extractSchoolBrandRoot(schoolNameB);
  if (!rootA || !rootB) return false;
  return rootA === rootB;
}

/**
 * Sister-school student movement is permitted ONLY for graduating primary
 * transition classes: Basic 5 and Basic 6 (including Primary 5 / Primary 6 / Grade 5 / Grade 6).
 */
export function isSisterSchoolTransitionGrade(
  grade?: string | null,
  classGradeKey?: string | null,
  sectionClass?: string | null,
): boolean {
  const candidates = [grade, classGradeKey, sectionClass];
  for (const raw of candidates) {
    const canon = canonicalGrade(raw);
    if (canon === 'Basic 5' || canon === 'Basic 6') return true;
  }
  return false;
}
