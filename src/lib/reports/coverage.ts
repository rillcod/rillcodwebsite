import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentTermLabel } from '@/lib/reports/academic-period';

type AnySupabase = SupabaseClient<any>;

/**
 * Which of the given students have a PUBLISHED progress report — optionally scoped to a term so
 * "needs report" means "needs one THIS term". Bulk-queried in chunks. Returns two sets:
 *   published — has a published report (for the term, when termLabel is given)
 *   drafted   — has a report but none published (for the term)
 */
export async function reportCoverageForStudents(
  admin: AnySupabase,
  studentIds: string[],
  opts?: { termLabel?: string | null; scopeToTerm?: boolean },
): Promise<{ published: Set<string>; drafted: Set<string> }> {
  const published = new Set<string>();
  const drafted = new Set<string>();
  const ids = studentIds.filter(Boolean);
  if (ids.length === 0) return { published, drafted };

  const term = opts?.scopeToTerm === false ? null : (opts?.termLabel ?? getCurrentTermLabel());

  for (let i = 0; i < ids.length; i += 300) {
    const batch = ids.slice(i, i + 300);
    let q = admin
      .from('student_progress_reports')
      .select('student_id, is_published, report_term')
      .in('student_id', batch);
    if (term) q = q.eq('report_term', term);
    const { data } = await q;
    for (const r of data ?? []) {
      const sid = (r as any).student_id;
      if (!sid) continue;
      if ((r as any).is_published) published.add(sid);
      else if (!published.has(sid)) drafted.add(sid);
    }
  }
  // A published report always wins over a lingering draft flag.
  for (const id of published) drafted.delete(id);
  return { published, drafted };
}

/** The current term label, exposed so callers/UI can label the coverage ("Second Term"). */
export function currentTermLabel(): string {
  return getCurrentTermLabel();
}
