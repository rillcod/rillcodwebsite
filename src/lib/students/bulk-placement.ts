import { bandCoversGrade, canonicalGrade, fixedBand } from '@/lib/classes/naming';

export type BulkPlacementClass = {
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
  return cls.qa_grade_band === bulkGradeBand(grade)
    || (!!cls.qa_grade_key && canonicalGrade(cls.qa_grade_key) === canonicalGrade(grade));
}

export function validateBulkClassPlacement(
  cls: BulkPlacementClass,
  expected: { schoolId: string; programId?: string | null; termId?: string | null },
): string | null {
  if (cls.school_id !== expected.schoolId) return 'Selected class does not belong to the selected school.';
  if (expected.programId && cls.program_id !== expected.programId) return 'Selected class does not belong to the selected programme.';
  if (expected.termId && cls.term_id !== expected.termId) return 'Selected class does not belong to the selected academic term.';
  return null;
}

