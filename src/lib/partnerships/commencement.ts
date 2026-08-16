/**
 * When teaching would actually start, named from the school calendar.
 *
 * Documents said "the commencement of the next academic term", which is true of
 * every school in the country and specific to none of them. `academic_terms` is
 * the single source of truth for sessions and terms across this platform — the
 * timetable, the reports and the invoices all date themselves from it — so a
 * contract has no business guessing.
 *
 * Everything here fails soft. A partnership document that could not be issued
 * because the calendar had not been set up yet would be a worse outcome than one
 * that says "the next academic term", which is what it said before.
 */

export type TeachingTerm = {
  id: string;
  academicYear: string;
  termLabel: string;
  termNumber: number;
  startDate: string | null;
  /** "Second Term, 2026/2027, from 6 January 2027" — the phrase a document prints. */
  phrase: string;
};

/** What a document says when the calendar cannot tell us anything better. */
export const UNKNOWN_COMMENCEMENT = 'the commencement of the next academic term';

function longDate(value: string): string | null {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function toPhrase(row: {
  term_label: string;
  academic_year: string;
  start_date: string | null;
}): string {
  const named = `${row.term_label}, ${row.academic_year}`;
  const from = row.start_date ? longDate(row.start_date) : null;
  return from ? `${named}, from ${from}` : named;
}

/**
 * The next term that has not started yet, or the current one if none is ahead.
 *
 * "Next" is decided on the start date rather than on `is_current`, because a
 * document issued three weeks into a term is offering to start in the term
 * after it, not the one already running.
 */
export async function nextTeachingTerm(
  db: { from: (t: string) => any },
  now = new Date(),
): Promise<TeachingTerm | null> {
  try {
    const today = now.toISOString().slice(0, 10);
    const { data } = await db
      .from('academic_terms')
      .select('id, academic_year, term_label, term_number, start_date, is_current')
      .gt('start_date', today)
      .order('start_date', { ascending: true })
      .limit(1);

    const row = Array.isArray(data) && data.length ? data[0] : null;
    if (!row) return null;

    return {
      id: String(row.id),
      academicYear: String(row.academic_year),
      termLabel: String(row.term_label),
      termNumber: Number(row.term_number) || 0,
      startDate: row.start_date ? String(row.start_date) : null,
      phrase: toPhrase(row),
    };
  } catch {
    // A missing table, an RLS refusal, a calendar nobody has filled in — all of
    // them mean "we do not know", and none of them should stop a document.
    return null;
  }
}

/** The commencement a document should state: what was typed, else the calendar, else the generic phrase. */
export function commencementLabel(
  typed: string | null | undefined,
  term: TeachingTerm | null,
): string {
  const given = String(typed ?? '').trim();
  if (given) return given;
  return term?.phrase ?? UNKNOWN_COMMENCEMENT;
}
