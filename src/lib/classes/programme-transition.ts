/** Young Innovators → Teen Developers programme bridge. */

import { canonicalGrade, canonicalTier, parseBandLabel } from '@/lib/classes/naming';

export const YOUNG_PROGRAMME = 'Young Innovators';
export const TEEN_PROGRAMME = 'Teen Developers';
export const DEFAULT_YOUNG_TO_TEEN_EXIT_GRADE = 'Basic 6' as const;

export type ProgrammeTier = 'young' | 'teen' | 'other';
export type YoungToTeenExitGrade = 'Basic 5' | 'Basic 6';

export type ProgrammeCatalogRow = { id: string; name: string | null };

/** Which programme ladder a grade belongs to. */
export function gradeProgrammeTier(grade: string | null | undefined): ProgrammeTier {
  const canon = canonicalGrade(grade);
  if (!canon) return 'other';
  const band = parseBandLabel(canon);
  if (!band) return 'other';
  if (band.lvl === 'JSS' || band.lvl === 'SS') return 'teen';
  if (band.lvl === 'Basic' || band.lvl === 'Nursery') return 'young';
  return 'other';
}

/** Crossing from pre-JSS (Young) into JSS/SS (Teen). */
export function isYoungToTeenBridge(
  fromGrade: string | null | undefined,
  toGrade: string | null | undefined,
): boolean {
  return gradeProgrammeTier(fromGrade) === 'young' && gradeProgrammeTier(toGrade) === 'teen';
}

export function resolveProgramIdByTier(
  programs: ProgrammeCatalogRow[] | undefined,
  tier: typeof YOUNG_PROGRAMME | typeof TEEN_PROGRAMME,
): string | null {
  if (!programs?.length) return null;
  const found = programs.find((p) => canonicalTier(p.name) === tier);
  return found?.id ?? null;
}

export function resolveDestinationProgrammeForPromotion(input: {
  fromGrade: string;
  toGrade: string;
  sourceProgramId?: string | null;
  sourceProgramName?: string | null;
  programs?: ProgrammeCatalogRow[];
}): {
  programId: string | null | undefined;
  programName: string | null | undefined;
  programme_transition: boolean;
  from_programme: string | null;
  to_programme: string | null;
} {
  if (!isYoungToTeenBridge(input.fromGrade, input.toGrade)) {
    return {
      programId: input.sourceProgramId,
      programName: input.sourceProgramName,
      programme_transition: false,
      from_programme: null,
      to_programme: null,
    };
  }

  const teenId = resolveProgramIdByTier(input.programs, TEEN_PROGRAMME);
  const fromTier = canonicalTier(input.sourceProgramName) ?? YOUNG_PROGRAMME;

  return {
    programId: teenId ?? undefined,
    programName: TEEN_PROGRAMME,
    programme_transition: true,
    from_programme: fromTier,
    to_programme: TEEN_PROGRAMME,
  };
}
