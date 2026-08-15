/**
 * How a partnership fee divides — stated once.
 *
 * The rule is that Rillcod is never the minority party. The database enforces it
 * on agreed terms:
 *
 *   partnership_terms_rillcod_not_minority
 *     CHECK (rillcod_share_percent IS NULL OR rillcod_share_percent >= 50)
 *   partnership_terms_shares_total
 *     CHECK (rillcod_share_percent + school_share_percent = 100)
 *
 * That CHECK only guards what is stored. The same rule was also being expressed
 * in the terms editor as `rillcod < 50`, in the composer's picker as a hardcoded
 * list of options, and in the proposal API as `school > 50` — the same rule, in
 * two directions, in four files. A proposal states the split on a document a
 * school then holds us to and stores nothing, so it is the one place a wrong
 * figure has no backstop at all.
 *
 * Everything now reads from here. Changing the floor means changing this
 * constant and the CHECK, and nothing else can quietly disagree.
 */

/** Rillcod's floor. At exactly 50 the parties are equal, which is permitted. */
export const MIN_RILLCOD_SHARE_PERCENT = 50;

/** The school's ceiling, which is the same rule seen from the other side. */
export const MAX_SCHOOL_SHARE_PERCENT = 100 - MIN_RILLCOD_SHARE_PERCENT;

/** What we quote unless a school negotiates. Rillcod 70 / school 30. */
export const STANDARD_RILLCOD_SHARE_PERCENT = 70;
export const STANDARD_SCHOOL_SHARE_PERCENT = 100 - STANDARD_RILLCOD_SHARE_PERCENT;

/** Said the same way wherever it is refused, so nobody meets two explanations. */
export const SPLIT_RULE_MESSAGE =
  `Rillcod may not take the minority of a partnership, so its share cannot fall below ` +
  `${MIN_RILLCOD_SHARE_PERCENT}% and the school's cannot exceed ${MAX_SCHOOL_SHARE_PERCENT}%.`;

/** True when this is a split we are allowed to offer or agree. */
export function isPermittedRillcodShare(percent: number): boolean {
  return Number.isFinite(percent) && percent >= MIN_RILLCOD_SHARE_PERCENT && percent <= 100;
}

export function isPermittedSchoolShare(percent: number): boolean {
  return Number.isFinite(percent) && percent >= 0 && percent <= MAX_SCHOOL_SHARE_PERCENT;
}

/**
 * The splits the desk offers, richest retention to most generous.
 *
 * Derived rather than typed out, so the list cannot come to contain an option
 * the rule forbids — which is what a hardcoded array eventually does.
 */
export const OFFERABLE_SCHOOL_SHARES: readonly { school: number; rillcod: number; label: string }[] =
  [20, 25, 30, 35, 40, 50]
    .filter(isPermittedSchoolShare)
    .map((school) => {
      const rillcod = 100 - school;
      const suffix =
        school === STANDARD_SCHOOL_SHARE_PERCENT
          ? 'Standard'
          : school === MAX_SCHOOL_SHARE_PERCENT
            ? 'Joint venture'
            : school > STANDARD_SCHOOL_SHARE_PERCENT
              ? 'School-weighted'
              : 'Rillcod-weighted';
      return { school, rillcod, label: `${school}% · ${rillcod}/${school} ${suffix}` };
    });

/** Raised when a caller asks for a split the rule does not permit. */
export class ImpermissibleSplitError extends Error {
  constructor(public readonly schoolPercent: number) {
    super(`A proposed school share of ${schoolPercent}% is not permitted. ${SPLIT_RULE_MESSAGE}`);
    this.name = 'ImpermissibleSplitError';
  }
}

/**
 * A school share from untrusted input, or null when none was given.
 *
 * Refuses rather than clamps: silently turning a requested 90 into 50 would
 * issue a document nobody asked for, and the person who asked would not know.
 */
export function normaliseSchoolSharePercent(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (!isPermittedSchoolShare(value)) throw new ImpermissibleSplitError(value);
  return value;
}
