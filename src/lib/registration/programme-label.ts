/**
 * What a learner actually bought, recovered from their registration record.
 *
 * Distinct from `programmeLabel` in @/lib/academic/labels, which formats a
 * programme name someone already has. This answers the earlier question — what
 * IS the programme name for this registration — from the notes and interest
 * fields registration writes. The generic fallback defers to that central
 * helper so the plain word is spelled in one place, not two.
 *
 * Why it exists: a special programme is by definition the thing that changes —
 * this year's summer school, next year's robotics bootcamp, a short course that
 * runs once. Every customer-facing surface (welcome email, receipt, invoice
 * line, balance reminder) nevertheless had "Summer School 2026" typed into it,
 * in about a dozen places. The first non-summer programme would have sent all
 * of those parents a receipt for a programme they never bought.
 */
import { programmeLabel } from '@/lib/academic/labels';

/**
 * The one cohort class name that predates page-driven programmes.
 *
 * Registrations from before the [SpecialPage:] tag existed were all placed in a
 * class with this name, so class-resolution hints still need it as a LAST
 * resort. It is defined here, once, so it stays a named piece of history rather
 * than a string retyped across onboarding, activation and placement.
 */
export const LEGACY_SUMMER_CLASS_NAME = 'Summer School 2026';

/**
 * What to call a programme in customer copy when nothing identifies it.
 *
 * Deliberately unbranded by cohort: a fallback that names a specific programme
 * is worse than one that names none, because it is confidently wrong on every
 * other programme.
 */
export const GENERIC_PROGRAMME_TITLE = 'your Rillcod programme';

/** Grade prefixes registration prepends to course_interest. */
const GRADE_PREFIX =
  /^(?:jss|sss|ss|js|pry|primary|basic|grade|year|class|nursery|creche)\s*\d*\s*/i;

/** The `[Programme: <title>]` tag written by buildProspectNotesString. */
export function programmeNameFromNotes(notes: string | null | undefined): string | null {
  const m = String(notes ?? '').match(/\[Programme:\s*([^\]]+)\]/i);
  return m?.[1]?.trim() || null;
}

/**
 * course_interest is stored as "<grade> <programme>" — e.g. "JSS 2 AI Summer
 * School 2026". Strip the grade so a receipt does not read "JSS 2 AI Summer
 * School 2026 Tuition".
 */
export function programmeNameFromCourseInterest(
  courseInterest: string | null | undefined,
): string | null {
  const raw = String(courseInterest ?? '').trim();
  if (!raw) return null;
  // If stripping consumes everything, the value was only a grade.
  return raw.replace(GRADE_PREFIX, '').trim() || null;
}

/**
 * The programme name for any customer-facing surface.
 *
 * Ordered strongest to weakest: the tag written at registration, then the
 * learner's stated interest, then the cohort class they sit in, then whatever
 * the caller offers, then the central generic word. Never returns empty, and
 * never invents a cohort it was not told about.
 */
export function registeredProgrammeName(input: {
  notes?: string | null;
  courseInterest?: string | null;
  className?: string | null;
  fallback?: string | null;
}): string {
  return (
    programmeNameFromNotes(input.notes)
    || programmeNameFromCourseInterest(input.courseInterest)
    || (input.className?.trim() || null)
    || (input.fallback?.trim() || null)
    || programmeLabel({})
  );
}
