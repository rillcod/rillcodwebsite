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
    cbt_exams?: {
      term_id?: string | null;
      metadata?: Record<string, unknown> | null;
    } | null;
  },
  termId: string | null | undefined,
  bounds: AcademicTermBounds | null,
  includeUntagged = true,
): boolean {
  if (!termId) return true;

  // Prefer first-class exam.term_id over metadata.
  const examTerm = String(row.cbt_exams?.term_id ?? '').trim() || null;
  if (examTerm) return examTerm === termId;

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
    cbt_exams?: {
      term_id?: string | null;
      metadata?: Record<string, unknown> | null;
    } | null;
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

/** Keep a CBT exam only if it belongs to `termId` (via term_id column, metadata, or date window). */
export function matchesCbtExam(
  exam: {
    term_id?: string | null;
    metadata?: Record<string, unknown> | null;
    start_date?: string | null;
    end_date?: string | null;
  },
  termId: string | null | undefined,
  bounds: AcademicTermBounds | null,
  includeUntagged = true,
): boolean {
  if (!termId) return true;

  const examTerm = String(exam.term_id ?? '').trim() || null;
  if (examTerm) return examTerm === termId;

  const meta = exam.metadata;
  const metaTerm =
    (meta && typeof meta === 'object'
      ? String((meta as any).term_id ?? (meta as any).academic_term_id ?? '').trim()
      : '') || null;
  if (metaTerm) return metaTerm === termId;

  if (!bounds?.start_date && !bounds?.end_date) return includeUntagged;

  // Prefer end_date for window membership; fall back to start_date.
  const anchor = exam.end_date || exam.start_date;
  const anchorMs = anchor ? Date.parse(anchor) : NaN;
  if (!Number.isFinite(anchorMs)) return includeUntagged;

  if (bounds.start_date) {
    const startMs = Date.parse(bounds.start_date);
    if (Number.isFinite(startMs) && anchorMs < startMs) return false;
  }
  if (bounds.end_date) {
    const endBound = dayEndMs(bounds.end_date);
    if (Number.isFinite(endBound) && anchorMs > endBound) return false;
  }
  return true;
}

export function filterCbtExamsByAcademicTerm<
  T extends {
    term_id?: string | null;
    metadata?: Record<string, unknown> | null;
    start_date?: string | null;
    end_date?: string | null;
  },
>(
  rows: T[],
  termId: string | null | undefined,
  bounds: AcademicTermBounds | null,
  opts: { includeUntagged?: boolean } = {},
): T[] {
  if (!termId) return rows;
  const includeUntagged = opts.includeUntagged !== false;
  return rows.filter((row) => matchesCbtExam(row, termId, bounds, includeUntagged));
}

/**
 * Returns true if an exam is an untagged leftover created before the current
 * academic session (`sessionStartMs`) with no current-session end_date or term_id.
 * Prevents prior-year open-ended exams from bleeding into newly promoted students' portals.
 */
export function isPriorSessionUntaggedCbtExam(
  exam: {
    term_id?: string | null;
    metadata?: Record<string, unknown> | null;
    start_date?: string | null;
    end_date?: string | null;
    created_at?: string | null;
  },
  sessionStartMs: number,
): boolean {
  if (!Number.isFinite(sessionStartMs)) return false;
  const examTerm = String(exam.term_id ?? '').trim();
  if (examTerm) return false;
  const meta = exam.metadata && typeof exam.metadata === 'object' ? exam.metadata : null;
  const metaTerm = meta ? String((meta as any).term_id ?? (meta as any).academic_term_id ?? '').trim() : '';
  if (metaTerm) return false;

  const endMs = exam.end_date ? Date.parse(exam.end_date) : NaN;
  if (Number.isFinite(endMs)) {
    return endMs < sessionStartMs;
  }
  const startMs = exam.start_date ? Date.parse(exam.start_date) : NaN;
  if (Number.isFinite(startMs)) {
    return startMs < sessionStartMs;
  }
  const createdMs = exam.created_at ? Date.parse(exam.created_at) : NaN;
  if (Number.isFinite(createdMs)) {
    return createdMs < sessionStartMs;
  }
  return false;
}
