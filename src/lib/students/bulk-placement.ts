import { bandCoversGrade, canonicalGrade, fixedBand } from '@/lib/classes/naming';

export type BulkPlacementClass = {
  name?: string | null;
  school_id?: string | null;
  program_id?: string | null;
  term_id?: string | null;
  qa_grade_key?: string | null;
  qa_grade_band?: string | null;
  band_lvl?: string | null;
  band_low?: number | null;
  band_high?: number | null;
};

export function bulkGradeBand(grade: string | null | undefined): string | null {
  return fixedBand(canonicalGrade(grade))?.label ?? null;
}

export function bulkClassCoversGrade(cls: BulkPlacementClass, grade: string): boolean {
  if (cls.band_lvl && cls.band_low != null && cls.band_high != null) {
    return bandCoversGrade({ lvl: cls.band_lvl, low: cls.band_low, high: cls.band_high }, grade);
  }
  const band = bulkGradeBand(grade);
  if (cls.qa_grade_band === band) return true;
  if (cls.qa_grade_key && canonicalGrade(cls.qa_grade_key) === canonicalGrade(grade)) return true;

  // Legacy sections often lack qa_* fields — match by class name when possible.
  const className = (cls.name || '').toLowerCase();
  if (!className) return false;
  const gradeCanon = canonicalGrade(grade)?.toLowerCase();
  if (gradeCanon && className.includes(gradeCanon)) return true;
  if (band && className.includes(band.toLowerCase())) return true;
  // "Basic 1-3" style in names vs student "Basic 2"
  const compactBand = band?.replace(/\s+/g, '').toLowerCase();
  const compactName = className.replace(/\s+/g, '');
  if (compactBand && compactName.includes(compactBand)) return true;
  return false;
}

export function validateBulkClassPlacement(
  cls: BulkPlacementClass,
  expected: { schoolId: string; programId?: string | null; termId?: string | null },
): string | null {
  // School must match when the class has a school. Missing school_id is legacy/broken data.
  if (cls.school_id && cls.school_id !== expected.schoolId) {
    return 'Selected class does not belong to the selected school.';
  }
  // Programme/term are soft for existing owned sections — stale or missing metadata
  // should not block placing students into the teacher's own class.
  return null;
}

