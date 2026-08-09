export interface CurriculumDirectionSummary {
  id: string;
  title?: string | null;
  source_curriculum_id?: string | null;
  course_id?: string | null;
  status?: string | null;
  academic_session?: string | null;
  effective_term_number?: number | null;
  audience_label?: string | null;
}

export interface CurriculumTimingSchedule {
  id: string;
  school_id?: string | null;
  class_id?: string | null;
  course_id?: string | null;
  release_id?: string | null;
  status?: string | null;
  entry_term_number?: number | null;
  entry_week_number?: number | null;
  curriculum_year_number?: number | null;
  curriculum_term_number?: number | null;
  curriculum_week_number?: number | null;
  sessions_per_week?: number | null;
  pacing_mode?: string | null;
}

export interface CurriculumTimingValues {
  entryTerm: number;
  entryWeek: number;
  programmeYear: number;
  programmeTerm: number;
  programmeWeek: number;
  sessionsPerWeek: number;
  pacing: string;
}

const DEFAULT_TIMING: CurriculumTimingValues = {
  entryTerm: 1,
  entryWeek: 1,
  programmeYear: 1,
  programmeTerm: 1,
  programmeWeek: 1,
  sessionsPerWeek: 1,
  pacing: "standard",
};

function normalized(value: string | null | undefined): string {
  return String(value ?? "").trim().toLocaleLowerCase();
}

/**
 * Finds the live edition for the exact publishing decision currently on screen.
 * Course-level matching is deliberately insufficient: the same course may have a
 * new source draft, a new academic session, or a different entry term.
 */
export function findLiveDirectionForDraft(
  directions: CurriculumDirectionSummary[],
  selection: {
    curriculumId: string;
    academicSession: string;
    effectiveTermNumber: number;
    audienceLabel: string;
  }
): CurriculumDirectionSummary | null {
  return (
    directions.find(
      (direction) =>
        direction.status === "published" &&
        direction.source_curriculum_id === selection.curriculumId &&
        normalized(direction.academic_session) ===
          normalized(selection.academicSession) &&
        Number(direction.effective_term_number ?? 1) ===
          selection.effectiveTermNumber &&
        normalized(direction.audience_label) === normalized(selection.audienceLabel)
    ) ?? null
  );
}

/**
 * A live edition of this same curriculum, published under a DIFFERENT session.
 *
 * findLiveDirectionForDraft matches the session exactly, which is right for
 * deciding "is this exact edition already out there". It is wrong as the only
 * signal on screen, because an edition's session is frozen at publication and
 * the schools' adoptions can be corrected afterwards.
 *
 * That is the live case here. Creative Coding with Scratch is stamped 2025/2026
 * — editions are immutable, so it will say that for ever — while all 58 school
 * adoptions were corrected to 2026/2027. An admin selecting 2026/2027 sees no
 * "already live" banner, concludes nothing is published, and publishes a second
 * edition of a curriculum that is already with every school.
 *
 * Surfaced rather than merged into the match: publishing a genuinely new edition
 * for a new session is legitimate and common. The screen just has to say that
 * one already exists first.
 */
export function findLiveDirectionInOtherSession(
  directions: CurriculumDirectionSummary[],
  selection: {
    curriculumId: string;
    academicSession: string;
    effectiveTermNumber: number;
    audienceLabel: string;
  }
): CurriculumDirectionSummary | null {
  return (
    directions.find(
      (direction) =>
        direction.status === "published" &&
        direction.source_curriculum_id === selection.curriculumId &&
        normalized(direction.audience_label) === normalized(selection.audienceLabel) &&
        Number(direction.effective_term_number ?? 1) === selection.effectiveTermNumber &&
        // The one thing that differs — otherwise findLiveDirectionForDraft owns it.
        normalized(direction.academic_session) !== normalized(selection.academicSession)
    ) ?? null
  );
}

/** Return the schedule that the timing form is about to update. */
export function findScheduleForTimingScope(
  schedules: CurriculumTimingSchedule[],
  assignment: {
    school_id: string;
    course_id: string;
    release_id: string;
  } | null,
  classId: string
): CurriculumTimingSchedule | null {
  if (!assignment) return null;
  return (
    schedules.find(
      (schedule) =>
        schedule.status !== "retired" &&
        schedule.school_id === assignment.school_id &&
        schedule.course_id === assignment.course_id &&
        schedule.release_id === assignment.release_id &&
        (classId
          ? schedule.class_id === classId
          : schedule.class_id == null || schedule.class_id === "")
    ) ?? null
  );
}

/** Prefill from saved truth; only a genuinely new scope receives safe defaults. */
export function timingValuesFromSchedule(
  schedule: CurriculumTimingSchedule | null
): CurriculumTimingValues {
  if (!schedule) return { ...DEFAULT_TIMING };
  return {
    entryTerm: Number(schedule.entry_term_number ?? 1),
    entryWeek: Number(schedule.entry_week_number ?? 1),
    programmeYear: Number(schedule.curriculum_year_number ?? 1),
    programmeTerm: Number(schedule.curriculum_term_number ?? 1),
    programmeWeek: Number(schedule.curriculum_week_number ?? 1),
    sessionsPerWeek: Number(schedule.sessions_per_week ?? 1),
    pacing: schedule.pacing_mode || "standard",
  };
}

export function validateCurriculumTiming(values: {
  entryTerm: number;
  entryWeek: number;
  programmeYear: number;
  programmeTerm: number;
  programmeWeek: number;
  sessionsPerWeek: number;
}): { ok: true } | { ok: false; error: string } {
  if (![1, 2, 3].includes(values.entryTerm)) {
    return { ok: false, error: "Choose a school entry term from First to Third Term." };
  }
  if (!Number.isInteger(values.entryWeek) || values.entryWeek < 1 || values.entryWeek > 12) {
    return { ok: false, error: "Choose a school entry week from 1 to 12." };
  }
  if (!Number.isInteger(values.programmeYear) || values.programmeYear < 1 || values.programmeYear > 6) {
    return { ok: false, error: "Programme year must be from 1 to 6." };
  }
  if (![1, 2, 3].includes(values.programmeTerm)) {
    return { ok: false, error: "Programme term must be First, Second, or Third Term." };
  }
  if (!Number.isInteger(values.programmeWeek) || values.programmeWeek < 1 || values.programmeWeek > 12) {
    return { ok: false, error: "Programme week must be from 1 to 12." };
  }
  if (!Number.isInteger(values.sessionsPerWeek) || values.sessionsPerWeek < 1 || values.sessionsPerWeek > 14) {
    return { ok: false, error: "Sessions per week must be from 1 to 14." };
  }
  return { ok: true };
}
