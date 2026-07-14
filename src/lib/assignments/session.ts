/**
 * Academic-session helpers for LMS assignments / gradebook isolation.
 * Session = year + term (via academic_terms.id). Never treat term-only as identity.
 */

import { liveAcademicSession } from '@/lib/reports/academic-period';

type AnyDb = {
  from: (table: string) => any;
};

/** Resolve canonical academic_terms.id for an assignment write. */
export async function resolveAssignmentTermId(
  db: AnyDb,
  opts: {
    termId?: string | null;
    classId?: string | null;
    /** When true (default), fall back to live calendar session. */
    fallbackLive?: boolean;
  } = {},
): Promise<string | null> {
  const explicit = String(opts.termId ?? '').trim();
  if (explicit) return explicit;

  const classId = String(opts.classId ?? '').trim();
  if (classId) {
    const { data: cls } = await db
      .from('classes')
      .select('term_id')
      .eq('id', classId)
      .maybeSingle();
    if ((cls as { term_id?: string | null } | null)?.term_id) {
      return String((cls as { term_id: string }).term_id);
    }
  }

  if (opts.fallbackLive === false) return null;

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
