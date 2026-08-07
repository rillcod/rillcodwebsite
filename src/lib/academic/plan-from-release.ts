/**
 * Turn an adopted curriculum release into a class's teaching plan.
 *
 * A class cannot generate a week until it has a lesson_plans row: every
 * generate route stops at "This class has no teaching plan to generate from
 * yet." Adoption was only half the journey — 58 classes had adopted a
 * curriculum and 4 had a plan, so 54 classes could adopt, look ready, and still
 * refuse to generate anything.
 *
 * Only two things in the codebase ever created a plan: bridgeTrack, reachable
 * from the special-programme routes alone, and a side-effect of editing a
 * lesson. Nothing carried a school class from "curriculum adopted" to "plan
 * exists", so it was done by hand or not at all.
 *
 * This is the mapping half, kept pure so it can be tested without a database:
 * a release holds `content.terms[]`, each term holds the `weeks[]` a plan needs.
 */

export type ReleaseWeek = {
  week?: unknown;
  type?: unknown;
  [key: string]: unknown;
};

export type ReleaseTerm = {
  term?: unknown;
  title?: unknown;
  weeks?: ReleaseWeek[] | null;
};

export type ReleaseContent = {
  terms?: ReleaseTerm[] | null;
  /** Older releases stored the weeks flat, with no term grouping. */
  weeks?: ReleaseWeek[] | null;
};

export type PlanData = {
  weeks: ReleaseWeek[];
  source_term?: number;
  source_title?: string;
};

/** Term numbers as the curriculum writes them. */
export function termNumberFrom(termLabel: string | null | undefined): number | null {
  const text = String(termLabel ?? '').toLowerCase();
  if (text.includes('first') || text.includes('1')) return 1;
  if (text.includes('second') || text.includes('2')) return 2;
  if (text.includes('third') || text.includes('3')) return 3;
  return null;
}

/**
 * The weeks a class should teach this term.
 *
 * Falls back deliberately rather than failing: a release that names no matching
 * term still has teaching in it, and refusing to build a plan would leave the
 * class exactly where it started — unable to generate. A plan built from the
 * first available term is a teacher's starting point; no plan is a dead end.
 */
export function planDataForTerm(
  content: ReleaseContent | null | undefined,
  termLabel: string | null | undefined,
): PlanData | null {
  if (!content || typeof content !== 'object') return null;

  const terms = Array.isArray(content.terms) ? content.terms : [];

  // A release with no term grouping at all — take its weeks as they are.
  if (terms.length === 0) {
    const flat = Array.isArray(content.weeks) ? content.weeks : [];
    return flat.length ? { weeks: flat } : null;
  }

  const hasWeeks = (t: ReleaseTerm | undefined) => Array.isArray(t?.weeks) && t.weeks!.length > 0;

  // The matching term only counts if it actually carries weeks. A term that
  // exists but is empty — Third Term written up but not yet filled in — would
  // otherwise win the match and produce a plan with nothing in it, which
  // generates exactly as much as no plan at all.
  const wanted = termNumberFrom(termLabel);
  const match = wanted !== null
    ? terms.find((t) => Number(t?.term) === wanted && hasWeeks(t))
    : undefined;

  const chosen = match ?? terms.find(hasWeeks);
  if (!chosen) return null;

  const weeks = Array.isArray(chosen.weeks) ? chosen.weeks : [];
  if (weeks.length === 0) return null;

  return {
    weeks,
    ...(Number.isFinite(Number(chosen.term)) ? { source_term: Number(chosen.term) } : {}),
    ...(typeof chosen.title === 'string' && chosen.title ? { source_title: chosen.title } : {}),
  };
}

export type PlanRow = {
  class_id: string;
  school_id: string;
  course_id: string;
  term_id: string | null;
  curriculum_release_id: string;
  plan_data: PlanData;
  status: 'published';
  version: number;
  sessions_per_week: number;
};

/**
 * The row to insert, shaped like the plans that already work.
 *
 * Published rather than draft on purpose: the generate routes refuse a draft
 * with "publish it and the whole week will generate", and a plan built from an
 * already-published curriculum release has nothing left to approve. Leaving it
 * draft would swap one blocking message for another.
 *
 * Returns null when a binding is missing — the routes check for a course and a
 * school, so writing a row without them creates something that looks ready and
 * still cannot generate.
 */
export function buildPlanRow(input: {
  classId: string;
  schoolId: string | null | undefined;
  courseId: string | null | undefined;
  termId: string | null | undefined;
  releaseId: string;
  planData: PlanData;
  sessionsPerWeek?: number;
}): PlanRow | null {
  if (!input.classId || !input.schoolId || !input.courseId || !input.releaseId) return null;
  if (!input.planData || !Array.isArray(input.planData.weeks) || input.planData.weeks.length === 0) return null;

  return {
    class_id: input.classId,
    school_id: input.schoolId,
    course_id: input.courseId,
    term_id: input.termId ?? null,
    curriculum_release_id: input.releaseId,
    plan_data: input.planData,
    status: 'published',
    version: 2,
    sessions_per_week: input.sessionsPerWeek && input.sessionsPerWeek > 0 ? input.sessionsPerWeek : 1,
  };
}
