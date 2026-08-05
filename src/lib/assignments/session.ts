/**
 * Academic-session helpers for LMS assignments / gradebook isolation.
 * Session = year + term (via academic_terms.id). Never treat term-only as identity.
 */

import { liveAcademicSession } from '@/lib/reports/academic-period';
import {
  allowLiveTermFallback,
  type TeachingPeriodContext,
} from '@/lib/academic/teaching-period';

type AnyDb = {
  from: (table: string) => any;
};

/** Load school / offering / term anchors from a class row for assignment writes. */
export async function loadTeachingPeriodFromClass(
  db: AnyDb,
  classId?: string | null,
  seed?: Partial<TeachingPeriodContext>,
): Promise<TeachingPeriodContext> {
  const period: TeachingPeriodContext = { ...(seed ?? {}) };
  const id = String(classId ?? period.class_id ?? '').trim();
  if (!id) return period;
  period.class_id = id;
  const { data: cls } = await db
    .from('classes')
    .select('school_id,term_id,academic_offering_id,offering_period_id')
    .eq('id', id)
    .maybeSingle();
  if (!cls) return period;
  if (cls.school_id && !period.school_id) period.school_id = String(cls.school_id);
  if (cls.term_id && !period.term_id) period.term_id = String(cls.term_id);
  if (cls.academic_offering_id && !period.academic_offering_id) {
    period.academic_offering_id = String(cls.academic_offering_id);
  }
  if (cls.offering_period_id && !period.offering_period_id) {
    period.offering_period_id = String(cls.offering_period_id);
  }
  return period;
}

/** Resolve canonical academic_terms.id for an assignment write. */
export async function resolveAssignmentTermId(
  db: AnyDb,
  opts: {
    termId?: string | null;
    classId?: string | null;
    /** When true (default), fall back to live calendar session. */
    fallbackLive?: boolean;
    /** Preferred: pass full teaching period so duration work never stamps live term. */
    period?: TeachingPeriodContext | null;
  } = {},
): Promise<string | null> {
  const classId = String(opts.classId ?? opts.period?.class_id ?? '').trim();
  const period = classId
    ? await loadTeachingPeriodFromClass(db, classId, opts.period ?? {})
    : { ...(opts.period ?? {}) };

  const explicit = String(opts.termId ?? '').trim();
  if (explicit) return explicit;

  // Duration / offering cohorts may still carry a school term_id on the class
  // row — never stamp that onto holiday programme assignments.
  const offeringBacked = Boolean(period.academic_offering_id);
  if (!offeringBacked && period.term_id) {
    return String(period.term_id);
  }

  let mayFallback = true;
  if (opts.fallbackLive === false) mayFallback = false;
  else mayFallback = allowLiveTermFallback(period);
  if (!mayFallback) return null;

  const live = liveAcademicSession();
  const { data: term } = await db
    .from('academic_terms')
    .select('id')
    .eq('academic_year', live.periodLabel)
    .eq('term_label', live.termLabel)
    .maybeSingle();
  return (term as { id?: string } | null)?.id ?? null;
}

/** Look up live term id (year + label) for gradebook defaults. */
export async function liveAcademicTermId(db: AnyDb): Promise<string | null> {
  return resolveAssignmentTermId(db, { fallbackLive: true });
}

/**
 * Keep a submission/assignment row only if it belongs to `termId`.
 * Legacy null term_id rows are kept only when `includeUntagged` is true
 * (typically for the live session so old work doesn't vanish overnight).
 */
export function matchesAssignmentSession(
  assignmentTermId: string | null | undefined,
  termId: string | null | undefined,
  includeUntagged = true,
): boolean {
  if (!termId) return true;
  const asn = assignmentTermId ?? null;
  if (asn === termId) return true;
  return includeUntagged && !asn;
}

/** Filter graded submission rows that join `assignments.term_id`. */
export function filterByAssignmentSession<T extends { assignments?: { term_id?: string | null } | null }>(
  rows: T[],
  termId: string | null | undefined,
  opts: { includeUntagged?: boolean } = {},
): T[] {
  if (!termId) return rows;
  const includeUntagged = opts.includeUntagged !== false;
  return rows.filter((row) =>
    matchesAssignmentSession(row.assignments?.term_id, termId, includeUntagged),
  );
}
