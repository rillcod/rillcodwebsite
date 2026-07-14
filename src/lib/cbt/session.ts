/**
 * Academic-session helpers for CBT scores.
 * CBT rows have no first-class term_id — prefer metadata.term_id, else end_time
 * within academic_terms start/end. Never mix historic CBT into live averages.
 */

type AnyDb = {
  from: (table: string) => any;
};

export type AcademicTermBounds = {
  id: string;
  start_date: string | null;
  end_date: string | null;
};

export async function loadAcademicTermBounds(
  db: AnyDb,
  termId: string | null | undefined,
): Promise<AcademicTermBounds | null> {
  const id = String(termId ?? '').trim();
  if (!id) return null;
  const { data } = await db
    .from('academic_terms')
    .select('id, start_date, end_date')
    .eq('id', id)
    .maybeSingle();
  return (data as AcademicTermBounds | null) ?? null;
}

function dayEndMs(isoDate: string): number {
  const t = Date.parse(isoDate);
  if (!Number.isFinite(t)) return NaN;
  // Date-only strings parse as UTC midnight — include that full calendar day.
  return /T/.test(isoDate) ? t : t + 24 * 60 * 60 * 1000 - 1;
}

/** Keep a CBT session only if it belongs to `termId`. */
export function matchesCbtSession(
  row: {
    end_time?: string | null;
    cbt_exams?: { metadata?: Record<string, unknown> | null } | null;
  },
  termId: string | null | undefined,
  bounds: AcademicTermBounds | null,
  includeUntagged = true,
): boolean {
  if (!termId) return true;

  const meta = row.cbt_exams?.metadata;
  const metaTerm =
    (meta && typeof meta === 'object'
      ? String((meta as any).term_id ?? (meta as any).academic_term_id ?? '').trim()
      : '') || null;
  if (metaTerm) return metaTerm === termId;

  if (!bounds?.start_date && !bounds?.end_date) return includeUntagged;

  const endMs = row.end_time ? Date.parse(row.end_time) : NaN;
  if (!Number.isFinite(endMs)) return includeUntagged;

  if (bounds.start_date) {
    const startMs = Date.parse(bounds.start_date);
    if (Number.isFinite(startMs) && endMs < startMs) return false;
  }
  if (bounds.end_date) {
    const endBound = dayEndMs(bounds.end_date);
    if (Number.isFinite(endBound) && endMs > endBound) return false;
  }
  return true;
}

export function filterCbtByAcademicTerm<
  T extends {
    end_time?: string | null;
    cbt_exams?: { metadata?: Record<string, unknown> | null } | null;
  },
>(
  rows: T[],
  termId: string | null | undefined,
  bounds: AcademicTermBounds | null,
  opts: { includeUntagged?: boolean } = {},
): T[] {
  if (!termId) return rows;
  const includeUntagged = opts.includeUntagged !== false;
  return rows.filter((row) => matchesCbtSession(row, termId, bounds, includeUntagged));
}
