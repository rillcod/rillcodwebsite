/**
 * Move a whole academic session's preparation from one term to another.
 *
 * The gap this fills was found the hard way. A curriculum was prepared for
 * "First Term" and the session dropdown on the publish form was left at
 * 2025/2026 — a First Term that had ended eight months earlier. The release,
 * 58 school adoptions, 56 classes, 49 lesson plans and every generated lesson,
 * deck and assignment beneath them all inherited that one wrong answer, and
 * there was no screen anywhere that could correct it. `app_settings.academic_year`
 * and `academic_terms.is_current` name the live session, but nothing re-stamps
 * the work already filed against the wrong one.
 *
 * So this is deliberately one operation over the whole chain, not a per-table
 * fix, and it draws a hard line down the middle of the schema:
 *
 *   PREPARATION moves.  Curriculum releases, adoptions, class term pointers,
 *   lesson plans and the content generated from those plans describe teaching
 *   that has not happened yet. Re-stamping them changes a plan, not a record.
 *
 *   HISTORY NEVER MOVES.  student_progress_reports, attendance, class_sessions
 *   and timetables are the record of what was actually taught and marked. A
 *   session correction that rewrote those would destroy the evidence behind
 *   published parent reports. They are excluded here structurally — no code
 *   path in this module can reach them — rather than by remembering not to.
 *
 * Assignments, lessons and flashcard decks straddle the line, so membership is
 * decided by provenance, not by date: content is preparation only if it hangs
 * off one of the lesson plans being moved. That distinction matters. Of the 7
 * assignments on the mis-stamped term, 4 were generated from the plans and 3
 * were set by hand mid-term, two of those already submitted against. A date
 * heuristic caught only 2 of the 4; the plan link catches exactly the right 4.
 */

export type TermRef = {
  id: string;
  academic_year: string;
  term_number: number;
  term_label: string;
  start_date: string | null;
  end_date: string | null;
};

export type ReleaseRow = {
  id: string;
  title: string | null;
  academic_session: string | null;
  effective_term_number: number | null;
  status: string | null;
};

export type AdoptionRow = {
  id: string;
  school_id: string | null;
  course_id: string | null;
  release_id: string | null;
  academic_session: string | null;
  effective_term_number: number | null;
  effective_academic_term_id: string | null;
};

export type ClassRow = {
  id: string;
  name: string | null;
  term_id: string | null;
  status: string | null;
  start_date: string | null;
};

export type RosterRow = {
  id: string;
  class_id: string;
  student_id: string;
  term_id: string | null;
  school_id: string | null;
  program_id?: string | null;
  status: string | null;
};

export type LessonPlanRow = {
  id: string;
  class_id: string | null;
  course_id: string | null;
  term: string | null;
  term_id: string | null;
  term_start: string | null;
  term_end: string | null;
  plan_data: Record<string, unknown> | null;
  status: string | null;
  curriculum_release_id: string | null;
};

export type DerivedRow = {
  id: string;
  lesson_plan_id: string | null;
  title?: string | null;
};

export type AssignmentRow = DerivedRow & {
  due_date: string | null;
  submission_count?: number;
};

/** "First Term 2026/2027" — the exact shape lesson_plans.term already stores. */
export function sessionTermLabel(term: Pick<TermRef, 'term_label' | 'academic_year'>): string {
  return `${term.term_label} ${term.academic_year}`.trim();
}

/**
 * Swap the academic year inside a free-text title.
 *
 * Release titles carry the session in prose — "Creative Coding with Scratch ·
 * 2025/2026 Academic Session · All assigned learner levels". Leaving that alone
 * while changing the column would put the wrong year in front of every teacher
 * who reads the title, which is most of them.
 */
export function retitleForSession(
  title: string | null | undefined,
  fromYear: string,
  toYear: string,
): string | null {
  if (!title) return title ?? null;
  if (!fromYear || fromYear === toYear) return title;
  return title.split(fromYear).join(toYear);
}

/**
 * Slide a date by the same offset that separates the two terms.
 *
 * An assignment generated for week 2 must land on week 2 of the term it moves
 * to. Keeping the original date would leave next session's work due in a month
 * that has already passed — which is exactly the state this operation exists to
 * repair, so re-creating it would be absurd.
 */
export function shiftDate(
  value: string | null | undefined,
  from: TermRef,
  to: TermRef,
): string | null {
  if (!value) return value ?? null;
  if (!from.start_date || !to.start_date) return value;
  const original = new Date(value);
  if (Number.isNaN(original.getTime())) return value;
  const offsetMs = new Date(`${to.start_date}T00:00:00Z`).getTime()
    - new Date(`${from.start_date}T00:00:00Z`).getTime();
  return new Date(original.getTime() + offsetMs).toISOString();
}

/**
 * Re-stamp the session strings a teacher actually sees inside a plan.
 *
 * plan_data.academic_direction is what the class workspace renders at the top of
 * the teaching screen. It is a snapshot taken when the plan was built, so it
 * keeps the old session until something rewrites it — the plan would read
 * "2025/2026 · Third Term" over First Term 2026/2027 content indefinitely.
 */
export function retargetPlanData(
  planData: Record<string, unknown> | null | undefined,
  to: TermRef,
  fromYear: string,
): Record<string, unknown> | null {
  if (!planData || typeof planData !== 'object') return planData ?? null;
  const direction = (planData as any).academic_direction;
  if (!direction || typeof direction !== 'object') return planData;
  return {
    ...planData,
    academic_direction: {
      ...direction,
      academic_session: to.academic_year,
      current_term: to.term_label,
      title: retitleForSession(direction.title, fromYear, to.academic_year),
    },
  };
}

export type RolloverPlan = {
  from: TermRef;
  to: TermRef;
  /**
   * Editions still naming the old session. Reported, never written.
   *
   * protect_published_curriculum_release refuses any change to a release's
   * academic_session, effective_term_number or title, and that refusal is the
   * point: an edition is the artefact schools adopted, so editing one rewrites
   * what they agreed to rather than recording a new decision. The platform's
   * own remedy is to publish a new edition and retire this one.
   *
   * Leaving them out of the write is safe because nothing resolves teaching
   * from a release's session — resolveOfficialCurriculumDirection filters
   * ADOPTIONS by academic_session and effective_term_number, and those do move.
   * What is left behind is the label in the title, which is why it is surfaced
   * here instead of being silently accepted.
   */
  releases_needing_new_edition: Array<{ id: string; title: string | null; suggested_title: string | null }>;
  adoptions: string[];
  adoption_conflicts: Array<{ id: string; reason: string }>;
  classes: Array<{ id: string; name: string | null }>;
  roster_carry_forward: Array<Omit<RosterRow, 'id' | 'term_id'> & { term_id: string }>;
  lesson_plans: Array<{
    id: string;
    term: string;
    term_id: string;
    term_start: string | null;
    term_end: string | null;
    plan_data: Record<string, unknown> | null;
  }>;
  lessons: string[];
  flashcard_decks: string[];
  assignments: Array<{ id: string; due_date: string | null }>;
  /**
   * Plans that cannot move because their curriculum edition is no longer live.
   *
   * attach_official_direction_to_lesson_plan re-validates the whole direction
   * chain on any change to term_id, so a plan pinned to a retired edition is
   * refused — correctly, since a class cannot enter a new term following
   * curriculum the Academic Office has withdrawn. Detecting it here rather than
   * letting the update fail is what keeps a correction from applying to half the
   * school: on the first real run, 40 plans moved and 9 were rejected mid-batch,
   * leaving those 9 classes on a different term from their own teaching plans.
   */
  plans_awaiting_live_edition: Array<{ id: string; class_id: string | null; release_id: string | null }>;
  blocked: string[];
};

export type RolloverInput = {
  from: TermRef;
  to: TermRef;
  releases: ReleaseRow[];
  adoptions: AdoptionRow[];
  existingAdoptionKeys: Set<string>;
  classes: ClassRow[];
  rosters: RosterRow[];
  existingRosterKeys: Set<string>;
  lessonPlans: LessonPlanRow[];
  existingPlanKeys: Set<string>;
  /** Editions that are still live. A plan pinned to anything else cannot move. */
  publishedReleaseIds: Set<string>;
  lessons: DerivedRow[];
  flashcardDecks: DerivedRow[];
  assignments: AssignmentRow[];
};

export function adoptionKey(row: {
  school_id: string | null;
  course_id: string | null;
  academic_session: string | null;
  effective_term_number: number | null;
}): string {
  return [row.school_id, row.course_id, row.academic_session, row.effective_term_number].join('|');
}

export function rosterKey(row: { class_id: string; student_id: string; term_id: string | null }): string {
  return [row.class_id, row.student_id, row.term_id ?? ''].join('|');
}

export function planKey(row: { class_id: string | null; course_id: string | null; term_id: string | null }): string {
  return [row.class_id, row.course_id, row.term_id ?? ''].join('|');
}

/**
 * Work out every change without making one.
 *
 * Everything an operator needs to approve is decided here, so the dry run and
 * the real run are the same computation — the apply step only writes what this
 * returned. A preview that re-derives its own numbers is a preview of something
 * else.
 */
export function buildRolloverPlan(input: RolloverInput): RolloverPlan {
  const { from, to } = input;
  const blocked: string[] = [];

  if (from.id === to.id) {
    blocked.push('The source and target terms are the same.');
  }

  const releases = input.releases.map((release) => ({
    id: release.id,
    title: release.title,
    suggested_title: retitleForSession(release.title, from.academic_year, to.academic_year),
  }));
  const releaseIds = new Set(releases.map((release) => release.id));

  const adoptions: string[] = [];
  const adoptionConflicts: RolloverPlan['adoption_conflicts'] = [];
  for (const adoption of input.adoptions) {
    if (!adoption.release_id || !releaseIds.has(adoption.release_id)) continue;
    const targetKey = adoptionKey({
      school_id: adoption.school_id,
      course_id: adoption.course_id,
      academic_session: to.academic_year,
      effective_term_number: to.term_number,
    });
    // A school that already adopted something for the target term keeps it. Two
    // adoptions cannot share (school, course, session, term), and overwriting the
    // one already there would silently retire a decision nobody asked about.
    if (input.existingAdoptionKeys.has(targetKey)) {
      adoptionConflicts.push({
        id: adoption.id,
        reason: `This school already has an adoption for ${sessionTermLabel(to)}.`,
      });
      continue;
    }
    adoptions.push(adoption.id);
  }

  const classes = input.classes
    .filter((klass) => klass.term_id === from.id && klass.status !== 'archived')
    .map((klass) => ({ id: klass.id, name: klass.name }));
  const classIds = new Set(classes.map((klass) => klass.id));

  /**
   * Classes that already sit at the target — the residue of an earlier run.
   *
   * Plan eligibility used to be "the class is moving", which made a partly
   * applied correction impossible to finish: once a class had moved, its own
   * stranded plan was no longer in scope, so re-running reported nothing to do
   * while the class and its plan still disagreed about the term. Counting the
   * arrived classes too is what makes this operation safely repeatable.
   */
  const settledClassIds = new Set(
    input.classes
      .filter((klass) => klass.term_id === to.id && klass.status !== 'archived')
      .map((klass) => klass.id),
  );
  const planEligible = (classId: string | null) =>
    !classId || classIds.has(classId) || settledClassIds.has(classId);

  // Membership is re-declared each term, so the class moving forward without its
  // roster would arrive at the new session empty: attendance filters the roster by
  // the session's term_id, and the accountability workspace counts the same rows.
  const rosterCarryForward = input.rosters
    .filter((row) => row.status === 'active' && row.term_id === from.id && classIds.has(row.class_id))
    .filter((row) => !input.existingRosterKeys.has(rosterKey({ ...row, term_id: to.id })))
    .map((row) => ({
      class_id: row.class_id,
      student_id: row.student_id,
      school_id: row.school_id,
      program_id: row.program_id ?? null,
      status: 'active',
      term_id: to.id,
    }));

  const nextTermLabel = sessionTermLabel(to);
  const lessonPlans: RolloverPlan['lesson_plans'] = [];
  const awaitingEdition: RolloverPlan['plans_awaiting_live_edition'] = [];
  for (const plan of input.lessonPlans) {
    if (plan.term_id !== from.id) continue;
    if (plan.status === 'archived') continue;
    if (!planEligible(plan.class_id)) continue;
    // Skipped, not blocked: one programme's withdrawn curriculum must not hold
    // back the correction for every other programme in the school.
    if (plan.curriculum_release_id && !input.publishedReleaseIds.has(plan.curriculum_release_id)) {
      awaitingEdition.push({
        id: plan.id,
        class_id: plan.class_id,
        release_id: plan.curriculum_release_id,
      });
      continue;
    }
    // lesson_plans_active_class_term_course_unique — a plan already sitting at the
    // target for this class and course would collide, and the write would fail
    // halfway through the batch rather than up front.
    if (input.existingPlanKeys.has(planKey({ ...plan, term_id: to.id }))) {
      blocked.push(`A teaching plan already exists at ${nextTermLabel} for class ${plan.class_id}.`);
      continue;
    }
    lessonPlans.push({
      id: plan.id,
      term: nextTermLabel,
      term_id: to.id,
      term_start: to.start_date,
      term_end: to.end_date,
      plan_data: retargetPlanData(plan.plan_data, to, from.academic_year),
    });
  }
  const planIds = new Set(lessonPlans.map((plan) => plan.id));

  const derivedFromMovedPlans = (rows: DerivedRow[]) =>
    rows.filter((row) => row.lesson_plan_id && planIds.has(row.lesson_plan_id)).map((row) => row.id);

  const assignments = input.assignments
    .filter((row) => row.lesson_plan_id && planIds.has(row.lesson_plan_id))
    // Work a learner has already handed in is a record, not a plan. It stays put
    // even though the plan above it moves.
    .filter((row) => !row.submission_count)
    .map((row) => ({ id: row.id, due_date: shiftDate(row.due_date, from, to) }));

  return {
    from,
    to,
    releases_needing_new_edition: releases,
    adoptions,
    adoption_conflicts: adoptionConflicts,
    classes,
    roster_carry_forward: rosterCarryForward,
    lesson_plans: lessonPlans,
    lessons: derivedFromMovedPlans(input.lessons),
    flashcard_decks: derivedFromMovedPlans(input.flashcardDecks),
    assignments,
    plans_awaiting_live_edition: awaitingEdition,
    blocked,
  };
}

export function summariseRolloverPlan(plan: RolloverPlan) {
  return {
    releases_needing_new_edition: plan.releases_needing_new_edition.length,
    adoptions: plan.adoptions.length,
    adoption_conflicts: plan.adoption_conflicts.length,
    classes: plan.classes.length,
    roster_rows_created: plan.roster_carry_forward.length,
    lesson_plans: plan.lesson_plans.length,
    lessons: plan.lessons.length,
    flashcard_decks: plan.flashcard_decks.length,
    assignments: plan.assignments.length,
    plans_awaiting_live_edition: plan.plans_awaiting_live_edition.length,
    blocked: plan.blocked.length,
  };
}
