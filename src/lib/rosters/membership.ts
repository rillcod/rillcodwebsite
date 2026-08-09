/**
 * Who is in a class, right now — one definition.
 *
 * Four places answered this and they disagreed: class_term_rosters (the
 * term-scoped record), portal_users.class_id (13 call sites treat it as
 * membership), enrollments.status (programme level), and the cached
 * classes.current_students. Nine learners were withdrawn on the roster and
 * still present according to class_id, and the stored count was wrong on twenty
 * of fifty-eight classes.
 *
 * The rule, stated once:
 *
 *   A learner is IN a class for a term when there is an active roster row for
 *   that class, that learner and that term.
 *
 *   A learner tied by class_id who has NEVER been rostered for that class also
 *   counts — some placement paths write class_id without a roster row, and
 *   dropping them would hide real children.
 *
 *   A learner this class has withdrawn does NOT count, whichever term the
 *   withdrawal was recorded in. A withdrawal outlives the term it was made in.
 *
 * This mirrors active_class_student_count exactly (migration
 * 20260929000051), so the database and the app cannot drift apart. If you
 * change one, change the other and the test that compares them.
 */

/** Roster statuses that mean the learner has left this class. */
const DEPARTED = new Set(['withdrawn', 'removed', 'ended']);

export type RosterRowLike = {
  class_id: string;
  student_id: string;
  term_id: string | null;
  status: string | null;
};

export type LearnerLike = {
  id: string;
  class_id: string | null;
  is_active?: boolean | null;
  is_deleted?: boolean | null;
};

export function hasDeparted(status: string | null | undefined): boolean {
  return DEPARTED.has(String(status ?? '').trim().toLowerCase());
}

/** A learner still on the books: active account, not deleted. */
export function isLiveLearner(learner: LearnerLike): boolean {
  return learner.is_active !== false && learner.is_deleted !== true;
}

/**
 * The learner ids in a class for a term.
 *
 * Pass every roster row for the class (all terms — the withdrawal may be
 * recorded against an earlier one) and the learners tied to it by class_id.
 */
export function classMemberIds(input: {
  classId: string;
  termId: string | null;
  rosterRows: RosterRowLike[];
  learners: LearnerLike[];
}): Set<string> {
  const forClass = input.rosterRows.filter((row) => row.class_id === input.classId);

  const active = new Set(
    forClass
      .filter((row) => row.term_id === input.termId && !hasDeparted(row.status))
      .filter((row) => String(row.status ?? '').trim().toLowerCase() === 'active')
      .map((row) => row.student_id),
  );

  // Ever told to leave this class, in any term.
  const departed = new Set(
    forClass.filter((row) => hasDeparted(row.status)).map((row) => row.student_id),
  );
  // Already has a row for this term — the roster has spoken, either way.
  const decidedThisTerm = new Set(
    forClass.filter((row) => row.term_id === input.termId).map((row) => row.student_id),
  );

  for (const learner of input.learners) {
    if (learner.class_id !== input.classId) continue;
    if (!isLiveLearner(learner)) continue;
    if (decidedThisTerm.has(learner.id)) continue;
    if (departed.has(learner.id)) continue;
    active.add(learner.id);
  }

  return active;
}

/** How many learners are in a class now. */
export function classHeadcount(input: Parameters<typeof classMemberIds>[0]): number {
  return classMemberIds(input).size;
}

/**
 * Learners whose roster and class tie contradict each other.
 *
 * Withdrawn on the roster, still pointing at the class through class_id. Not
 * repaired automatically: whether they are back or gone is a decision about a
 * child, and a script that guessed either way would be wrong half the time.
 */
export function contradictedLearners(input: {
  rosterRows: RosterRowLike[];
  learners: LearnerLike[];
}): Array<{ learnerId: string; classId: string }> {
  const out: Array<{ learnerId: string; classId: string }> = [];
  for (const learner of input.learners) {
    if (!learner.class_id || !isLiveLearner(learner)) continue;
    const rows = input.rosterRows.filter(
      (row) => row.student_id === learner.id && row.class_id === learner.class_id,
    );
    if (rows.length === 0) continue;
    const anyActive = rows.some((row) => String(row.status ?? '').toLowerCase() === 'active');
    if (!anyActive && rows.some((row) => hasDeparted(row.status))) {
      out.push({ learnerId: learner.id, classId: learner.class_id });
    }
  }
  return out;
}
