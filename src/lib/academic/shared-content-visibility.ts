/**
 * Who may see a week of content once one copy serves many schools.
 *
 * Content is written per class today: 26 classes across 14 schools adopted the
 * same curriculum release and each generated its own copy of the same Week 3.
 * Generating once per release removes that duplication, but it also removes the
 * thing that made visibility obvious — an assignment carried a class_id, and a
 * learner saw the assignments carrying theirs.
 *
 * Shared content cannot carry one class's id, so visibility has to be resolved
 * rather than read off the row. This module is that resolution, kept pure so
 * the rule can be stated and tested before any schema moves. Get it wrong in
 * the other direction and a learner in one school sees another school's work.
 *
 * The rule, in one line: a learner sees a week when their own class has adopted
 * the release that week belongs to, and their class has reached it.
 */

export type SharedContent = {
  /** The curriculum release this content was generated for. */
  curriculum_release_id: string;
  curriculum_week_number: number;
};

export type LearnerContext = {
  /** The class the learner is in. Nothing resolves without it. */
  classId: string | null | undefined;
  /** The release that class adopted, via its teaching plan. */
  adoptedReleaseId: string | null | undefined;
  /** How far the class has been taken. Weeks beyond this are not theirs yet. */
  weeksReleasedToLearners: number;
};

export type ClassOverride = {
  curriculum_week_number: number;
  /** Content this class wrote for itself, replacing the shared week. */
  content_id: string;
};

/**
 * Whether this learner may see this shared week.
 *
 * Deliberately requires an explicit adoption match rather than falling back to
 * "show it anyway". A missing adoption is the state of a class that has not
 * been set up yet, and the safe answer there is nothing — showing another
 * school's material is worse than showing an empty week.
 */
export function canLearnerSeeSharedWeek(
  content: SharedContent | null | undefined,
  learner: LearnerContext | null | undefined,
): boolean {
  if (!content || !learner) return false;
  if (!learner.classId) return false;
  if (!learner.adoptedReleaseId) return false;

  // The week belongs to a curriculum this class did not adopt.
  if (content.curriculum_release_id !== learner.adoptedReleaseId) return false;

  const week = Number(content.curriculum_week_number);
  if (!Number.isFinite(week) || week < 1) return false;

  // Not taught yet. A class three weeks in must not see week eight because
  // another school on the same curriculum has already been given it.
  const released = Number(learner.weeksReleasedToLearners);
  if (!Number.isFinite(released) || released < 1) return false;

  return week <= released;
}

/**
 * The content a learner should actually be served for a week.
 *
 * A class that rewrote a week sees its own version; everyone else sees the
 * shared one. Returns null when the learner may not see the week at all, so a
 * caller cannot accidentally serve the shared copy by treating "no override" as
 * "use the master".
 */
export function resolveWeekForLearner(input: {
  content: SharedContent | null | undefined;
  learner: LearnerContext | null | undefined;
  /** Overrides belonging to THIS learner's class only. */
  classOverrides?: readonly ClassOverride[] | null;
}): { source: 'class' | 'shared'; contentId?: string } | null {
  if (!canLearnerSeeSharedWeek(input.content, input.learner)) return null;

  const week = Number(input.content!.curriculum_week_number);
  const override = (input.classOverrides ?? []).find(
    (o) => Number(o.curriculum_week_number) === week,
  );

  return override
    ? { source: 'class', contentId: override.content_id }
    : { source: 'shared' };
}

/**
 * Filter a batch of shared content down to what this learner may see.
 *
 * The batch form exists because the per-item form invites a caller to fetch
 * everything for a release and filter in the page — which works until someone
 * forgets, and then a class sees every school's weeks.
 */
export function visibleWeeksForLearner(
  content: readonly SharedContent[] | null | undefined,
  learner: LearnerContext | null | undefined,
): SharedContent[] {
  return (content ?? []).filter((c) => canLearnerSeeSharedWeek(c, learner));
}

/**
 * Whether a class may freeze a week against further regeneration.
 *
 * Locking is per class, never per shared row. One school publishing week 3 to
 * its learners must not stop the other twenty-five classes on that curriculum
 * from receiving an improved week 3 — under the old per-class model a lock
 * affected one class by construction, and sharing silently widens it to all of
 * them unless the lock is held somewhere class-scoped.
 */
export function lockScopeForSharedWeek(): 'class' {
  return 'class';
}
