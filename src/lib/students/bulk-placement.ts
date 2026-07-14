import { bandCoversGrade, canonicalGrade, fixedBand } from '@/lib/classes/naming';

export type BulkPlacementClass = {
  id?: string;
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

/** Programme id match, or name match for legacy rows like "Young Innov 3". */
export function bulkClassMatchesProgramme(
  cls: BulkPlacementClass,
  programId?: string | null,
  programName?: string | null,
): boolean {
  if (!programId) return true;
  if (!cls.program_id || cls.program_id === programId) return true;
  if (!programName) return false;
  const className = (cls.name || '').toLowerCase();
  const programme = programName.toLowerCase();
  if (className.includes(programme)) return true;
  const shortProgramme = programme
    .replace(/\binnovators\b/g, 'innov')
    .replace(/\bdevelopers\b/g, 'dev');
  return shortProgramme !== programme && className.includes(shortProgramme);
}

export function buildBulkPlacementPool<T extends BulkPlacementClass & { id: string }>(
  classes: T[],
  opts: {
    schoolId?: string | null;
    programId?: string | null;
    programName?: string | null;
    termId?: string | null;
  },
): { pool: T[]; preferredIds: Set<string>; usingProgrammeFallback: boolean } {
  // Section picker always lists every class at the school. Programme/term only rank.
  const schoolClasses = classes.filter(
    (c) => !opts.schoolId || !c.school_id || c.school_id === opts.schoolId,
  );

  const preferredIds = new Set(
    schoolClasses
      .filter((c) => {
        const programOk = bulkClassMatchesProgramme(c, opts.programId, opts.programName);
        const termOk = !opts.termId || !c.term_id || c.term_id === opts.termId;
        return programOk && termOk;
      })
      .map((c) => c.id),
  );

  const pool = [...schoolClasses].sort((a, b) => {
    const aPreferred = preferredIds.has(a.id) ? 0 : 1;
    const bPreferred = preferredIds.has(b.id) ? 0 : 1;
    if (aPreferred !== bPreferred) return aPreferred - bPreferred;
    return (a.name || '').localeCompare(b.name || '');
  });

  return { pool, preferredIds, usingProgrammeFallback: false };
}

export function validateBulkClassPlacement(
  cls: BulkPlacementClass,
  expected: { schoolId: string; programId?: string | null; termId?: string | null },
): string | null {
  // School must match when the class has a school. Missing school_id is legacy/broken data.
  if (cls.school_id && cls.school_id !== expected.schoolId) {
    return 'Selected class does not belong to the selected school.';
  }
  // Programme must match when present. Term must match when both sides have a term_id
  // so First Term 2025/2026 never places into a Third Term / next-year class.
  if (expected.programId && cls.program_id && cls.program_id !== expected.programId) {
    return 'Selected class does not belong to the selected programme.';
  }
  if (expected.termId && cls.term_id && cls.term_id !== expected.termId) {
    return 'Selected class does not belong to the selected academic year / term.';
  }
  return null;
}
