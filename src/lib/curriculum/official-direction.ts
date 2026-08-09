import { effectiveDeliverySchedule } from "@/lib/curriculum/deliverySchedule";
import { mapSessionCalendarToCurriculumPosition } from "@/lib/curriculum/sessionAwareSchedule";
import {
  mapSyllabusWeekToPlanRow,
  type SyllabusWeekImport,
} from "@/lib/lesson-plans/syllabusImport";

export type OfficialCurriculumDirection = {
  id: string;
  course_id: string;
  source_curriculum_id: string | null;
  title: string;
  content: Record<string, unknown>;
  academic_session: string | null;
  effective_term_number: number | null;
  grade_key: string | null;
  audience_label: string | null;
  source_metadata: Record<string, unknown> | null;
  status: string;
};

type DirectionScope = {
  schoolId: string;
  offeringId: string | null;
  courseId: string;
  academicSession?: string | null;
  academicTermNumber?: number | null;
  pinnedReleaseId?: string | null;
};

function relation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

const RELEASE_SELECT =
  "id,course_id,source_curriculum_id,title,content,academic_session,effective_term_number,grade_key,audience_label,source_metadata,status";

/**
 * Resolve the one official direction for a class/course. A release already
 * pinned to a plan wins forever. New Online/Special plans never borrow a
 * Regular School adoption when their offering has no direction.
 */
export async function resolveOfficialCurriculumDirection(
  db: any,
  scope: DirectionScope
): Promise<OfficialCurriculumDirection | null> {
  if (scope.pinnedReleaseId) {
    const { data } = await db
      .from("academic_curriculum_releases")
      .select(RELEASE_SELECT)
      .eq("id", scope.pinnedReleaseId)
      .maybeSingle();
    // A pin wins forever — but only while the edition is still standing.
    //
    // "Forever" used to include retired editions, and that left a class
    // following curriculum the Academic Office had explicitly withdrawn, with no
    // way out: the readiness sweep re-resolved to the same dead pin, the
    // stranded tool only re-points school adoptions and never plans, and no
    // screen exposes the pin at all. Nine Teen Developers plans sat on a
    // withdrawn Python edition while a live replacement was already adopted by
    // all 29 schools.
    //
    // Ignoring a retired pin falls through to the normal resolution below, which
    // finds the live adoption. The reason to honour a pin in the first place —
    // not yanking a class onto a new edition mid-term — only ever applied to an
    // edition that still exists.
    if (data && (data as { status?: string }).status !== "retired") {
      return data as OfficialCurriculumDirection;
    }
  }

  let offeringType: string | null = null;
  if (scope.offeringId) {
    const { data: offering } = await db
      .from("academic_offerings")
      .select("enrollment_type")
      .eq("id", scope.offeringId)
      .maybeSingle();
    offeringType = offering?.enrollment_type ?? null;

    // Independent Online and Special pathways must own an explicit direction.
    if (offeringType && offeringType !== "school") {
      const { data: precise } = await db
        .from("academic_offering_curriculum_directions")
        .select(`release:academic_curriculum_releases(${RELEASE_SELECT})`)
        .eq("academic_offering_id", scope.offeringId)
        .eq("course_id", scope.courseId)
        .eq("status", "active")
        .maybeSingle();
      return relation<OfficialCurriculumDirection>(precise?.release);
    }
  }

  let adoptionQuery = db
    .from("academic_curriculum_adoptions")
    // Adoptions reach releases through BOTH release_id and previous_release_id, so an unhinted
    // embed is refused outright (PGRST201) and this resolver returned null for every class. That
    // is what made a freshly published curriculum land in 29 schools and still report
    // "no official edition assigned" on every one of them.
    .select(`release:academic_curriculum_releases!academic_curriculum_adoptions_release_id_fkey(${RELEASE_SELECT})`)
    .eq("school_id", scope.schoolId)
    .eq("course_id", scope.courseId)
    .eq("status", "active");
  if (scope.academicSession) {
    adoptionQuery = adoptionQuery.eq("academic_session", scope.academicSession);
  }
  if (scope.academicTermNumber) {
    adoptionQuery = adoptionQuery.lte("effective_term_number", scope.academicTermNumber);
  }
  const { data: adoption } = await adoptionQuery
    .order("effective_term_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const adoptedRelease = relation<OfficialCurriculumDirection>(
    adoption?.release
  );
  if (adoptedRelease) return adoptedRelease;

  // Compatibility for historical Regular School offerings created before
  // session-aware adoptions. New records should resolve through the adoption.
  if (scope.offeringId && !scope.academicSession) {
    const { data: precise } = await db
      .from("academic_offering_curriculum_directions")
      .select(`release:academic_curriculum_releases(${RELEASE_SELECT})`)
      .eq("academic_offering_id", scope.offeringId)
      .eq("course_id", scope.courseId)
      .eq("status", "active")
      .maybeSingle();
    return relation<OfficialCurriculumDirection>(precise?.release);
  }
  return null;
}

export async function resolveOfficialDeliverySchedule(
  db: any,
  input: {
    schoolId: string;
    classId: string;
    courseId: string;
    releaseId: string;
  }
) {
  const { data } = await db
    .from("academic_curriculum_delivery_schedules")
    .select("*")
    .eq("school_id", input.schoolId)
    .eq("course_id", input.courseId)
    .eq("release_id", input.releaseId)
    .eq("status", "active")
    .or(`class_id.is.null,class_id.eq.${input.classId}`);
  return effectiveDeliverySchedule({
    schoolDefault: (data ?? []).find((row: any) => !row.class_id) ?? null,
    classOverride:
      (data ?? []).find((row: any) => row.class_id === input.classId) ?? null,
  }) as any;
}

export function mapOfficialCurriculumToCalendarWeeks(input: {
  content: Record<string, unknown>;
  directionAcademicSession: string | null;
  currentAcademicSession: string | null;
  calendarTerm: number;
  schedule: Record<string, unknown>;
}) {
  const weeks: Record<string, unknown>[] = [];
  const terms: any[] = Array.isArray(input.content?.terms)
    ? (input.content.terms as any[])
    : [];

  // Every week of every term, keeping the numbering the curriculum was authored
  // with. The plan's week number is the key everything downstream joins on —
  // lessons, assignments, delivery records — so it has to be unique across the
  // whole plan. Curricula that restart at 1 each term would otherwise produce
  // three weeks called "1", and indexFirstByWeek would hand Term 1's card the
  // Term 2 lesson. Where the authored number is already taken, the week keeps
  // its true position in official_position and is given the next free number.
  const takenWeekNumbers = new Set<number>();
  for (const term of terms) {
    const termWeeks = Array.isArray(term.weeks) ? term.weeks : [];
    for (const sourceWeek of termWeeks) {
      const mappedRow = mapSyllabusWeekToPlanRow(sourceWeek as SyllabusWeekImport);
      const authored = Number(sourceWeek.week);
      const programmeWeek =
        Number.isInteger(authored) && authored > 0 ? authored : weeks.length + 1;

      let weekNum = programmeWeek;
      while (takenWeekNumbers.has(weekNum)) weekNum += 1;
      takenWeekNumbers.add(weekNum);

      weeks.push({
        ...mappedRow,
        week: weekNum,
        official_position: {
          programme_year: Number(term.year ?? 1),
          programme_term: Number(term.term ?? 1),
          // The week as the curriculum names it, even when the plan had to
          // renumber to keep its own keys unique.
          programme_week: programmeWeek,
        },
      });
    }
  }

  // Fallback: If no terms or weeks were populated through term iteration, use position mapper
  if (weeks.length === 0) {
    for (let calendarWeek = 1; calendarWeek <= 12; calendarWeek += 1) {
      const position = mapSessionCalendarToCurriculumPosition({
        entryAcademicSession: input.directionAcademicSession,
        currentAcademicSession: input.currentAcademicSession,
        calendarTerm: input.calendarTerm,
        calendarWeek,
        schedule: {
          entryTerm: Number(input.schedule.entry_term_number ?? 1),
          entryWeek: Number(input.schedule.entry_week_number ?? 1),
          curriculumYear: Number(input.schedule.curriculum_year_number ?? 1),
          curriculumTerm: Number(input.schedule.curriculum_term_number ?? 1),
          curriculumWeek: Number(input.schedule.curriculum_week_number ?? 1),
        },
      });
      if (!position) continue;
      const term =
        terms.find(
          (item) =>
            Number(item.year ?? 1) === position.year &&
            Number(item.term) === position.term
        ) ?? terms.find((item) => Number(item.term) === position.term);
      const sourceWeek = Array.isArray(term?.weeks)
        ? term.weeks.find((item: any) => Number(item.week) === position.week)
        : null;
      if (!sourceWeek) continue;
      weeks.push({
        ...mapSyllabusWeekToPlanRow(sourceWeek as SyllabusWeekImport),
        week: calendarWeek,
        official_position: {
          programme_year: position.year,
          programme_term: position.term,
          programme_week: position.week,
        },
      });
    }
  }
  return weeks;
}

export function canonicalPlanCurriculum(input: {
  official_curriculum?: unknown;
  curriculum?: unknown;
}): (Record<string, unknown> & { content?: unknown }) | null {
  return (
    relation<Record<string, unknown> & { content?: unknown }>(
      input.official_curriculum as any
    ) ??
    relation<Record<string, unknown> & { content?: unknown }>(
      input.curriculum as any
    )
  );
}
