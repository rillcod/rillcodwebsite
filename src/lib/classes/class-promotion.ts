/**
 * End-of-session class promotion — one place for "Basic 1 → Basic 2" moves.
 *
 * Historical records (reports, grades, attendance) never move; only live placement:
 * portal_users, students registry, class_term_rosters, programme enrollments — via
 * reinstateStudentToClass.
 */

import {
  canonicalGrade,
  parseBandLabel,
  SINGLE_GRADES,
  type CanonicalBand,
} from '@/lib/classes/naming';
import {
  bulkClassCoversGrade,
  buildBulkPlacementPool,
  type BulkPlacementClass,
} from '@/lib/students/bulk-placement';
import {
  DEFAULT_YOUNG_TO_TEEN_EXIT_GRADE,
  isYoungToTeenBridge,
  resolveDestinationProgrammeForPromotion,
  TEEN_PROGRAMME,
  type ProgrammeCatalogRow,
  type YoungToTeenExitGrade,
} from '@/lib/classes/programme-transition';

export type PromotionClassRow = BulkPlacementClass & {
  id: string;
  name?: string | null;
  school_id?: string | null;
  program_id?: string | null;
  teacher_id?: string | null;
  term_id?: string | null;
  qa_grade_key?: string | null;
  qa_grade_band?: string | null;
};

export type PromotionStudentRow = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  grade?: string | null;
};

export type PromotionMovePlan = {
  student_id: string;
  student_name: string;
  from_grade: string;
  to_grade: string;
  destination_class_id: string;
  destination_class_name: string;
  skipped: boolean;
  skip_reason?: string;
  /** Young Innovators → Teen Developers at Basic 6 → JSS 1 */
  programme_transition?: boolean;
  from_programme?: string | null;
  to_programme?: string | null;
};

export type ClassPromotionPlan = {
  source_class_id: string;
  source_class_name: string;
  source_grade_anchor: string | null;
  default_destination_class_id: string | null;
  default_destination_class_name: string | null;
  moves: PromotionMovePlan[];
  promotable_count: number;
  skipped_count: number;
  blocked: string[];
  programme_transition_count: number;
  has_programme_bridge: boolean;
};

/** Next step on the school grade ladder (Nursery 1 … SS 3). */
export function nextSingleGrade(grade: string | null | undefined): string | null {
  const canon = canonicalGrade(grade);
  if (!canon) return null;
  const idx = (SINGLE_GRADES as readonly string[]).indexOf(canon);
  if (idx >= 0 && idx < SINGLE_GRADES.length - 1) {
    return SINGLE_GRADES[idx + 1];
  }
  return null;
}

/** Next placement grade, including the school's Young → Teen exit point. */
export function nextPromotionGrade(
  grade: string | null | undefined,
  youngToTeenExitGrade: YoungToTeenExitGrade = DEFAULT_YOUNG_TO_TEEN_EXIT_GRADE,
): string | null {
  const canon = canonicalGrade(grade);
  if (!canon) return null;
  if (canon === youngToTeenExitGrade) return 'JSS 1';
  return nextSingleGrade(canon);
}

/** Grade this class primarily represents (for whole-class promotion). */
export function inferClassGradeAnchor(cls: {
  qa_grade_key?: string | null;
  qa_grade_band?: string | null;
  name?: string | null;
}): string | null {
  const key = canonicalGrade(cls.qa_grade_key);
  if (key) return key;
  const band: CanonicalBand | null =
    parseBandLabel(cls.qa_grade_band) ?? parseBandLabel(cls.qa_grade_key);
  if (band) return band.low === band.high ? `${band.lvl} ${band.low}` : `${band.lvl} ${band.low}`;
  return canonicalGrade(cls.name);
}

export function resolveStudentPromotionGrade(
  student: { grade?: string | null },
  classAnchor: string | null,
): string | null {
  return canonicalGrade(student.grade) ?? classAnchor;
}

/** Pick the best destination class for a target grade at this school. */
export function pickDestinationClass(
  candidates: PromotionClassRow[],
  opts: {
    schoolId: string;
    programId?: string | null;
    programName?: string | null;
    termId?: string | null;
    targetGrade: string;
    preferTeacherId?: string | null;
    excludeClassId?: string | null;
  },
): PromotionClassRow | null {
  const { pool } = buildBulkPlacementPool(candidates, {
    schoolId: opts.schoolId,
    programId: opts.programId,
    programName: opts.programName,
    termId: opts.termId,
  });

  const matches = pool.filter(
    (c) =>
      c.id !== opts.excludeClassId &&
      bulkClassCoversGrade(c, opts.targetGrade),
  );
  if (!matches.length) return null;

  if (opts.preferTeacherId) {
    const owned = matches.find((c) => c.teacher_id === opts.preferTeacherId);
    if (owned) return owned as PromotionClassRow;
  }

  return matches[0] as PromotionClassRow;
}

function pickPromotionDestination(
  schoolClasses: PromotionClassRow[],
  sourceClass: PromotionClassRow,
  fromGrade: string,
  toGrade: string,
  programName: string | null | undefined,
  programs: ProgrammeCatalogRow[] | undefined,
  overrideDest: PromotionClassRow | null,
): { dest: PromotionClassRow | null; programme: ReturnType<typeof resolveDestinationProgrammeForPromotion> } {
  const programme = resolveDestinationProgrammeForPromotion({
    fromGrade,
    toGrade,
    sourceProgramId: sourceClass.program_id,
    sourceProgramName: programName,
    programs,
  });

  if (overrideDest) {
    return { dest: overrideDest, programme };
  }

  const dest = pickDestinationClass(schoolClasses, {
    schoolId: sourceClass.school_id!,
    programId: programme.programId ?? sourceClass.program_id,
    programName: programme.programName ?? programName,
    termId: sourceClass.term_id,
    targetGrade: toGrade,
    preferTeacherId: sourceClass.teacher_id,
    excludeClassId: sourceClass.id,
  });

  return { dest, programme };
}

export function buildClassPromotionPlan(input: {
  sourceClass: PromotionClassRow;
  students: PromotionStudentRow[];
  schoolClasses: PromotionClassRow[];
  destinationClassId?: string | null;
  programName?: string | null;
  programs?: ProgrammeCatalogRow[];
  youngToTeenExitGrade?: YoungToTeenExitGrade;
}): ClassPromotionPlan {
  const blocked: string[] = [];
  const anchor = inferClassGradeAnchor(input.sourceClass);
  if (!anchor) {
    blocked.push('Could not read a grade level for this class. Set the class grade band first.');
  }

  const defaultNext = anchor
    ? nextPromotionGrade(anchor, input.youngToTeenExitGrade)
    : null;
  let defaultDest: PromotionClassRow | null = null;

  if (defaultNext && input.sourceClass.school_id) {
    const anchorBridge = anchor && isYoungToTeenBridge(anchor, defaultNext);
    const defaultProgramme = resolveDestinationProgrammeForPromotion({
      fromGrade: anchor ?? '',
      toGrade: defaultNext,
      sourceProgramId: input.sourceClass.program_id,
      sourceProgramName: input.programName,
      programs: input.programs,
    });
    defaultDest = pickDestinationClass(input.schoolClasses, {
      schoolId: input.sourceClass.school_id,
      programId: defaultProgramme.programId ?? input.sourceClass.program_id,
      programName: defaultProgramme.programName ?? input.programName,
      termId: input.sourceClass.term_id,
      targetGrade: defaultNext,
      preferTeacherId: input.sourceClass.teacher_id,
      excludeClassId: input.sourceClass.id,
    });
    if (!defaultDest) {
      blocked.push(
        anchorBridge
          ? `No ${TEEN_PROGRAMME} class found for ${defaultNext}. Create a Teen Developers · ${defaultNext} class at this school first, or pick a destination manually.`
          : `No class found for ${defaultNext}. Create "${defaultNext}" at this school first, or pick a destination manually.`,
      );
    }
  }

  const overrideDest = input.destinationClassId
    ? input.schoolClasses.find((c) => c.id === input.destinationClassId) ?? null
    : null;

  const moves: PromotionMovePlan[] = [];

  for (const student of input.students) {
    const fromGrade = resolveStudentPromotionGrade(student, anchor);
    const toGrade = fromGrade
      ? nextPromotionGrade(fromGrade, input.youngToTeenExitGrade)
      : null;
    const name = student.full_name ?? student.email ?? student.id;

    if (!fromGrade) {
      moves.push({
        student_id: student.id,
        student_name: name,
        from_grade: 'Unknown',
        to_grade: '—',
        destination_class_id: '',
        destination_class_name: '',
        skipped: true,
        skip_reason: 'No grade on file — set grade or use a class with a clear grade band.',
      });
      continue;
    }

    if (!toGrade) {
      moves.push({
        student_id: student.id,
        student_name: name,
        from_grade: fromGrade,
        to_grade: 'Graduate',
        destination_class_id: '',
        destination_class_name: '',
        skipped: true,
        skip_reason: `${fromGrade} is the top level — mark complete instead of promote.`,
      });
      continue;
    }

    const { dest, programme } = pickPromotionDestination(
      input.schoolClasses,
      input.sourceClass,
      fromGrade,
      toGrade,
      input.programName,
      input.programs,
      overrideDest,
    );

    if (!dest) {
      moves.push({
        student_id: student.id,
        student_name: name,
        from_grade: fromGrade,
        to_grade: toGrade,
        destination_class_id: '',
        destination_class_name: '',
        skipped: true,
        skip_reason: programme.programme_transition
          ? `No ${TEEN_PROGRAMME} class at ${toGrade} for this school.`
          : `No class at ${toGrade} for this school/programme.`,
      });
      continue;
    }

    moves.push({
      student_id: student.id,
      student_name: name,
      from_grade: fromGrade,
      to_grade: toGrade,
      destination_class_id: dest.id,
      destination_class_name: dest.name ?? toGrade,
      skipped: false,
      programme_transition: programme.programme_transition,
      from_programme: programme.from_programme,
      to_programme: programme.to_programme,
    });
  }

  const promotable = moves.filter((m) => !m.skipped);
  const destIds = new Set(promotable.map((m) => m.destination_class_id));
  const resolvedDefaultId =
    overrideDest?.id ?? (destIds.size === 1 ? [...destIds][0] : defaultDest?.id ?? null);
  const resolvedDefaultName =
    overrideDest?.name ??
    (destIds.size === 1
      ? promotable.find((m) => m.destination_class_id === resolvedDefaultId)?.destination_class_name
      : defaultDest?.name) ??
    null;

  const programmeTransitionCount = promotable.filter((m) => m.programme_transition).length;

  return {
    source_class_id: input.sourceClass.id,
    source_class_name: input.sourceClass.name ?? 'This class',
    source_grade_anchor: anchor,
    default_destination_class_id: resolvedDefaultId,
    default_destination_class_name: resolvedDefaultName,
    moves,
    promotable_count: promotable.length,
    skipped_count: moves.filter((m) => m.skipped).length,
    blocked,
    programme_transition_count: programmeTransitionCount,
    has_programme_bridge: programmeTransitionCount > 0,
  };
}

export function summarisePromotionPlan(plan: ClassPromotionPlan) {
  const destinations = new Set(
    plan.moves.filter((m) => !m.skipped).map((m) => m.destination_class_id),
  );
  return {
    source_grade: plan.source_grade_anchor,
    promotable: plan.promotable_count,
    skipped: plan.skipped_count,
    destination_classes: destinations.size,
    blocked: plan.blocked.length,
  };
}
