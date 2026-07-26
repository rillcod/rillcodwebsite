import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Rillcod runs the Nigerian three-term calendar, and the gaps between terms are real
 * holidays — Aug→Sep, Dec→Jan, and the short Easter break. Learners are supposed to be
 * away during those weeks, so engagement nudges and period summaries must not go out:
 * a "you broke your streak" push on the second day of the Christmas holiday is not a
 * reminder, it is a reason to mute us.
 *
 * `academic_terms` is the canonical calendar (one row per year+term with start/end dates),
 * so term membership is decided from it rather than from a hardcoded month list.
 */

export interface TermWindow {
  /** True when today falls inside a term's [start_date, end_date]. */
  inTerm: boolean;
  /** Label of the term we are inside, when there is one. */
  termLabel: string | null;
  academicYear: string | null;
  /** Set when we are between terms — the day the next term begins, if one is scheduled. */
  nextTermStarts: string | null;
  /**
   * True when the calendar has no usable dated rows at all. Callers should keep sending in
   * that case: we cannot claim a holiday exists on a calendar that was never filled in.
   */
  calendarMissing: boolean;
}

/** Today in WAT (UTC+1) as YYYY-MM-DD — `start_date`/`end_date` are plain dates. */
export function watToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Normalise a date column that may arrive as `2026-04-30` or a full ISO timestamp. */
function asDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

export function resolveTermWindow(
  terms: Array<{ academic_year: string | null; term_label: string | null; start_date: string | null; end_date: string | null }>,
  today: string = watToday(),
): TermWindow {
  const dated = terms
    .map((t) => ({ ...t, start: asDay(t.start_date), end: asDay(t.end_date) }))
    .filter((t): t is typeof t & { start: string; end: string } => !!t.start && !!t.end);

  if (!dated.length) {
    return { inTerm: true, termLabel: null, academicYear: null, nextTermStarts: null, calendarMissing: true };
  }

  // Plain YYYY-MM-DD strings compare correctly with <=, so no Date maths or timezone drift.
  const current = dated.find((t) => t.start <= today && today <= t.end);
  if (current) {
    return {
      inTerm: true,
      termLabel: current.term_label ?? null,
      academicYear: current.academic_year ?? null,
      nextTermStarts: null,
      calendarMissing: false,
    };
  }

  const upcoming = dated.filter((t) => t.start > today).sort((a, b) => a.start.localeCompare(b.start))[0];
  return {
    inTerm: false,
    termLabel: null,
    academicYear: null,
    nextTermStarts: upcoming?.start ?? null,
    calendarMissing: false,
  };
}

export async function loadTermWindow(db: SupabaseClient<any>, today: string = watToday()): Promise<TermWindow> {
  const { data, error } = await db
    .from('academic_terms')
    .select('academic_year, term_label, start_date, end_date');
  if (error) throw new Error(`Academic calendar unavailable: ${error.message}`);
  return resolveTermWindow((data ?? []) as never, today);
}
