/**
 * What we can truthfully say about our own footprint, counted at issue time.
 *
 * A proposal is marketing, and the most persuasive thing on it is the school
 * that is not yet a client reading how many already are. That number has to be
 * true on the day it is printed, so it is counted rather than typed — a figure
 * typed into a template is a figure that was true once.
 *
 * Every count deliberately excludes deleted rows and counts only what the word
 * means: a partner school is an approved, undeleted school, not a lead. If the
 * counts cannot be read, this returns null and the proposal prints without the
 * band — a quote with no proof band is thinner, a quote with a wrong one is a
 * claim we have to answer for.
 */

export type ProofPoints = {
  partnerSchools: number;
  students: number;
  /** Years in the published progression. */
  years: number;
};

export async function loadProofPoints(
  db: { from: (t: string) => any },
  /**
   * The school being quoted. Excluded from the count, because it is already a
   * row in `schools` the moment somebody picks it — so without this the cover
   * tells a prospect they are one of the partners it is citing as the reason to
   * become one.
   */
  excludeSchoolId?: string | null,
): Promise<ProofPoints | null> {
  try {
    const schoolQuery = db
      .from('schools')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved')
      .neq('is_deleted', true);

    const [schools, students, levels] = await Promise.all([
      excludeSchoolId ? schoolQuery.neq('id', excludeSchoolId) : schoolQuery,
      db
        .from('portal_users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'student')
        .eq('is_active', true)
        .neq('is_deleted', true),
      db.from('curriculum_progression_levels').select('id', { count: 'exact', head: true }),
    ]);

    const partnerSchools = Number(schools?.count ?? 0);
    const studentCount = Number(students?.count ?? 0);
    const years = Number(levels?.count ?? 0);

    // Nothing to boast about, or the counts did not come back. Either way the
    // band is omitted rather than printed as zeros.
    if (partnerSchools <= 0 || studentCount <= 0) return null;

    return { partnerSchools, students: studentCount, years };
  } catch {
    return null;
  }
}

/**
 * A marketing figure rather than an exact count: 895 → "800+", 29 → "25+".
 *
 * Always rounds **down**, never up, so the claim is one we are already past and
 * stays true as the number moves. It also stops a proposal reading like a
 * database dump — "895 students" invites someone to check whether it is 894
 * today, where "800+" is a claim that survives the term.
 */
export function approx(n: number): string {
  if (n < 20) return String(n);
  const step = n < 100 ? 5 : n < 1000 ? 100 : 500;
  return `${Math.floor(n / step) * step}+`;
}
