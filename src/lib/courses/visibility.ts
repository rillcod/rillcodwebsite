/**
 * Course visibility — application-layer policy.
 *
 * The `courses.is_locked` flag already exists at the DB level (default false
 * = visible).  This module adds product rules on top of the raw flag without
 * requiring a migration:
 *
 *  - `ALWAYS_PUBLIC_PROGRAMS` — programmes that are always visible to every
 *    learner regardless of `courses.is_locked`.  These are our headline
 *    programmes that MUST reach prospects (Young Innovator, Teen Developer).
 *    Matching is case-insensitive and tolerant of minor spelling variations
 *    (e.g. "Young Innovators", "Teen Developers").
 *
 *  - `isCourseVisibleToLearners(course)` — pure predicate used by any
 *    student- / parent- / guest-facing query to decide if a course should
 *    be shown.  Admin and teacher queries never run this filter.
 *
 *  - `applyCourseVisibilityFilter(rows)` — array helper for client-side
 *    filtering of already-fetched rows.
 */

export const ALWAYS_PUBLIC_PROGRAMS = [
  'young innovator',
  'young innovators',
  'teen developer',
  'teen developers',
] as const;

export function isAlwaysPublicProgramName(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return ALWAYS_PUBLIC_PROGRAMS.some(p => n === p || n.startsWith(p));
}

/**
 * Decides whether a course should be visible to learners (student / parent /
 * guest / public catalog).  Admin / teacher / school staff views should NOT
 * use this filter — they always see everything.
 *
 * A course is visible to learners when ANY of the following holds:
 *  - it is not locked (`is_locked !== true`), OR
 *  - its programme is one of the always-public programmes.
 *
 * The course must also be active (`is_active !== false`).
 */
export function isCourseVisibleToLearners(course: {
  is_locked?: boolean | null;
  is_active?: boolean | null;
  programs?: { name?: string | null } | null;
  program?: { name?: string | null } | null;
  program_name?: string | null;
}): boolean {
  if (course.is_active === false) return false;
  const programName =
    course.programs?.name ?? course.program?.name ?? course.program_name ?? null;
  if (isAlwaysPublicProgramName(programName)) return true;
  return course.is_locked !== true;
}

export function applyCourseVisibilityFilter<T extends Parameters<typeof isCourseVisibleToLearners>[0]>(
  rows: T[] | null | undefined,
): T[] {
  if (!rows) return [];
  return rows.filter(isCourseVisibleToLearners);
}
