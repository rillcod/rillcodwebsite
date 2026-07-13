import type { SupabaseClient } from '@supabase/supabase-js';
import {
  coverageSessionOrFilter,
  getCurrentAcademicYear,
  getCurrentTermLabel,
  liveAcademicSession,
  normalizePeriodLabel,
  normalizeTermLabel,
} from '@/lib/reports/academic-period';

type AnySupabase = SupabaseClient<any>;

type CoverageRow = {
  student_id: string | null;
  is_published: boolean | null;
  term_id?: string | null;
  report_term?: string | null;
  report_period?: string | null;
};

/**
 * PUBLISHED / drafted coverage for a specific academic session.
 * Session scope is always (term + year) — Second and Third never share a bucket,
 * and First Term next year never clears First Term this year.
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
  const live = liveAcademicSession();
  const termId = scopeOff ? null : (opts?.termId ?? null);
  const termLabel = scopeOff
    ? null
    : normalizeTermLabel(opts?.termLabel ?? (termId ? live.termLabel : getCurrentTermLabel()));
  const periodLabel = scopeOff
    ? null
    : normalizePeriodLabel(opts?.periodLabel ?? getCurrentAcademicYear());

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

    if (!termId && !termLabel && !periodLabel) {
      const { data, error } = await admin
        .from('student_progress_reports')
        .select('student_id, is_published, term_id, report_term, report_period')
        .in('student_id', batch);
      if (error) throw new Error(`report coverage query failed: ${error.message}`);
      absorb(data as CoverageRow[]);
      continue;
    }

    const orFilter = coverageSessionOrFilter({ termId, termLabel, periodLabel });
    if (orFilter) {
      const { data, error } = await admin
        .from('student_progress_reports')
        .select('student_id, is_published, term_id, report_term, report_period')
        .in('student_id', batch)
        .or(orFilter);
      if (error) throw new Error(`report coverage query failed: ${error.message}`);
      absorb(data as CoverageRow[]);
      continue;
    }

    let q = admin
      .from('student_progress_reports')
      .select('student_id, is_published, term_id, report_term, report_period')
      .in('student_id', batch);
    if (termId) {
      q = q.eq('term_id', termId);
    } else {
      // Label path always needs BOTH term and period so years never collide.
      if (termLabel) q = q.eq('report_term', termLabel);
      if (periodLabel) q = q.eq('report_period', periodLabel);
    }
    const { data, error } = await q;
    if (error) throw new Error(`report coverage query failed: ${error.message}`);
    absorb(data as CoverageRow[]);
  }

  for (const id of published) drafted.delete(id);
  return { published, drafted };
}

export function currentAcademicPeriod(): { termLabel: string; periodLabel: string } {
  return liveAcademicSession();
}

export function currentTermLabel(): string {
  return getCurrentTermLabel();
}
