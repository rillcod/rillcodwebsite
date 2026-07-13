import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentAcademicYear, getCurrentTermLabel } from '@/lib/reports/academic-period';

type AnySupabase = SupabaseClient<any>;

type CoverageRow = {
  student_id: string | null;
  is_published: boolean | null;
  term_id?: string | null;
  report_term?: string | null;
  report_period?: string | null;
};

/**
 * Which of the given students have a PUBLISHED progress report — optionally scoped to a term so
 * "needs report" means "needs one THIS term". Bulk-queried in chunks. Returns two sets:
 *   published — has a published report (for the term, when termLabel is given)
 *   drafted   — has a report but none published (for the term)
 *
 * Matching is dual-safe: `term_id` OR (`report_term` + `report_period`) so legacy rows
 * without term_id (and callers that only pass labels) stay consistent across roster,
 * portal list, and the coverage widget.
 */
export async function reportCoverageForStudents(
  admin: AnySupabase,
  studentIds: string[],
  opts?: { termId?: string | null; termLabel?: string | null; periodLabel?: string | null; scopeToTerm?: boolean },
): Promise<{ published: Set<string>; drafted: Set<string> }> {
  const published = new Set<string>();
  const drafted = new Set<string>();
  const ids = studentIds.filter(Boolean);
  if (ids.length === 0) return { published, drafted };

  const scopeOff = opts?.scopeToTerm === false;
  const termId = scopeOff ? null : (opts?.termId ?? null);
  const termLabel = scopeOff ? null : (opts?.termLabel ?? (termId ? null : getCurrentTermLabel()));
  const periodLabel = scopeOff ? null : (opts?.periodLabel ?? getCurrentAcademicYear());
  // When we have a canonical term id, still keep labels for OR-match (null term_id rows).
  const labelTerm = scopeOff ? null : (opts?.termLabel ?? (termId ? getCurrentTermLabel() : termLabel));
  const labelPeriod = periodLabel;

  const absorb = (rows: CoverageRow[] | null | undefined) => {
    for (const r of rows ?? []) {
      const sid = r.student_id;
      if (!sid) continue;
      if (r.is_published) published.add(sid);
      else if (!published.has(sid)) drafted.add(sid);
    }
  };

  for (let i = 0; i < ids.length; i += 300) {
    const batch = ids.slice(i, i + 300);

    if (!termId && !labelTerm && !labelPeriod) {
      const { data, error } = await admin
        .from('student_progress_reports')
        .select('student_id, is_published, term_id, report_term, report_period')
        .in('student_id', batch);
      if (error) throw new Error(`report coverage query failed: ${error.message}`);
      absorb(data as CoverageRow[]);
      continue;
    }

    // Prefer one OR query when both id and labels are available.
    if (termId && labelTerm && labelPeriod) {
      const { data, error } = await admin
        .from('student_progress_reports')
        .select('student_id, is_published, term_id, report_term, report_period')
        .in('student_id', batch)
        .or(
          `term_id.eq.${termId},and(report_term.eq."${labelTerm}",report_period.eq."${labelPeriod}")`,
        );
      if (error) throw new Error(`report coverage query failed: ${error.message}`);
      absorb(data as CoverageRow[]);
      continue;
    }

    let q = admin
      .from('student_progress_reports')
      .select('student_id, is_published, term_id, report_term, report_period')
      .in('student_id', batch);
    if (termId) q = q.eq('term_id', termId);
    if (!termId && labelTerm) q = q.eq('report_term', labelTerm);
    if (labelPeriod && !termId) q = q.eq('report_period', labelPeriod);
    // termId-only: do NOT also require report_period (legacy null/mismatch periods).
    const { data, error } = await q;
    if (error) throw new Error(`report coverage query failed: ${error.message}`);
    absorb(data as CoverageRow[]);
  }

  for (const id of published) drafted.delete(id);
  return { published, drafted };
}

/** The current term label, exposed so callers/UI can label the coverage ("Second Term"). */
export function currentAcademicPeriod(): { termLabel: string; periodLabel: string } {
  return { termLabel: getCurrentTermLabel(), periodLabel: getCurrentAcademicYear() };
}

export function currentTermLabel(): string {
  return getCurrentTermLabel();
}
