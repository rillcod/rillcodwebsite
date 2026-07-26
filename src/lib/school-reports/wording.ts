/**
 * Voice rules for the school report book.
 *
 * This document is sent to Heads of School and read by parents, so it has to
 * read like a written report rather than generated output. The rules here are
 * the ones that were being broken in a way readers notice.
 */

/**
 * "1 week" / "3 weeks" — never "1 week(s)".
 *
 * Roughly twenty report lines used the "(s)" shorthand, which is fine in a log
 * file and wrong in a document addressed to a principal. It reads as unfinished,
 * and it is most visible in exactly the sentences that matter: "Complete the
 * 1 curriculum week(s) currently in progress."
 *
 * Pass an explicit plural for irregular nouns.
 */
export function countNoun(count: number | null | undefined, singular: string, pluralForm?: string): string {
  const n = typeof count === 'number' && Number.isFinite(count) ? count : 0;
  const word = Math.abs(n) === 1 ? singular : (pluralForm ?? `${singular}s`);
  return `${n} ${word}`;
}

/**
 * The noun alone, matched to a count — for sentences that place the number
 * somewhere other than immediately before the word.
 */
export function nounFor(count: number | null | undefined, singular: string, pluralForm?: string): string {
  const n = typeof count === 'number' && Number.isFinite(count) ? count : 0;
  return Math.abs(n) === 1 ? singular : (pluralForm ?? `${singular}s`);
}
