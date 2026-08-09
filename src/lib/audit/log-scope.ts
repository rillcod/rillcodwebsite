/**
 * Who may read which log, and over which schools.
 *
 * Split out of the two routes because they had drifted apart: the CSV export
 * refused a teacher asking for the admin audit trail and the on-screen listing
 * did not, so the same request answered differently depending on which button
 * produced it. An export is only a listing with a different Content-Type — if
 * the two disagree about access, one of them is wrong by definition.
 *
 * The rule follows the schema rather than a preference. `activity_logs` carries
 * a `school_id` on every row, so it can be scoped to a teacher's schools.
 * `audit_logs` has no school column at all — there is nothing to scope by, and
 * every attempt to "filter it a bit" ends up showing one school's staff what
 * another school's staff did. So it is admin-only, and that is enforced here
 * once instead of twice.
 */

export type LogActorRole = 'admin' | 'teacher';

export type LogScopeDecision =
  | { ok: false; status: 403; error: string }
  | { ok: true; scope: 'all' }
  | { ok: true; scope: 'schools'; schoolIds: string[] }
  | { ok: true; scope: 'none' };

/**
 * Decide access before any query is built.
 *
 * `scope: 'none'` is deliberately distinct from a 403. A teacher attached to no
 * school has permission to look and simply has nothing in range; the previous
 * code expressed that as `&& user.school_id`, which skipped the filter
 * altogether and returned every school's activity instead of none of it.
 */
export function resolveLogScope(input: {
  type: 'audit' | 'activity';
  role: LogActorRole;
  teacherSchoolIds: string[];
}): LogScopeDecision {
  if (input.type === 'audit') {
    if (input.role !== 'admin') {
      return {
        ok: false,
        status: 403,
        error: 'The audit trail covers every school and is restricted to administrators.',
      };
    }
    return { ok: true, scope: 'all' };
  }

  if (input.role === 'admin') return { ok: true, scope: 'all' };
  if (input.teacherSchoolIds.length === 0) return { ok: true, scope: 'none' };
  return { ok: true, scope: 'schools', schoolIds: input.teacherSchoolIds };
}

/**
 * Page boundaries for an export that must not silently truncate.
 *
 * Returned as ranges rather than looped inline so the arithmetic can be tested:
 * an off-by-one here does not fail loudly, it just quietly drops the last few
 * rows of an accountability export.
 */
export function exportPageRanges(total: number, pageSize: number): Array<[number, number]> {
  if (total <= 0 || pageSize <= 0) return [];
  const ranges: Array<[number, number]> = [];
  for (let offset = 0; offset < total; offset += pageSize) {
    ranges.push([offset, Math.min(total, offset + pageSize) - 1]);
  }
  return ranges;
}
