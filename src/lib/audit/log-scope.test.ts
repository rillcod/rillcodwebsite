import { describe, expect, it } from 'vitest';
import { exportPageRanges, resolveLogScope } from './log-scope';

describe('log access scope', () => {
  it('refuses the audit trail to a teacher, on screen and in an export alike', () => {
    // The leak: the listing route gated nothing on type, so ?type=audit handed a
    // teacher the whole platform's audit trail while the export correctly said no.
    const decision = resolveLogScope({ type: 'audit', role: 'teacher', teacherSchoolIds: ['s1'] });
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.status).toBe(403);
  });

  it('gives an admin the whole audit trail', () => {
    expect(resolveLogScope({ type: 'audit', role: 'admin', teacherSchoolIds: [] }))
      .toEqual({ ok: true, scope: 'all' });
  });

  it('scopes a teacher to every school they teach at, not just their primary', () => {
    expect(resolveLogScope({ type: 'activity', role: 'teacher', teacherSchoolIds: ['s1', 's2'] }))
      .toEqual({ ok: true, scope: 'schools', schoolIds: ['s1', 's2'] });
  });

  it('returns nothing — not everything — for a teacher with no school', () => {
    // The second leak. `&& user.school_id` meant a falsy school_id skipped the
    // filter entirely, so the least-attached account saw the most data.
    expect(resolveLogScope({ type: 'activity', role: 'teacher', teacherSchoolIds: [] }))
      .toEqual({ ok: true, scope: 'none' });
  });

  it('leaves admin activity unscoped', () => {
    expect(resolveLogScope({ type: 'activity', role: 'admin', teacherSchoolIds: [] }))
      .toEqual({ ok: true, scope: 'all' });
  });
});

describe('export paging', () => {
  it('covers every row exactly once when the total divides evenly', () => {
    expect(exportPageRanges(2000, 1000)).toEqual([[0, 999], [1000, 1999]]);
  });

  it('does not overshoot the last partial page', () => {
    // Ranges are inclusive, so the final page must stop at total - 1 rather than
    // offset + pageSize - 1; overshooting is how an export ends up short.
    expect(exportPageRanges(2500, 1000)).toEqual([[0, 999], [1000, 1999], [2000, 2499]]);
  });

  it('handles a single short page', () => {
    expect(exportPageRanges(7, 1000)).toEqual([[0, 6]]);
  });

  it('asks for nothing when there is nothing to export', () => {
    expect(exportPageRanges(0, 1000)).toEqual([]);
  });

  it('adds up to the total, for any shape', () => {
    for (const total of [1, 999, 1000, 1001, 4321, 50_000]) {
      const covered = exportPageRanges(total, 1000)
        .reduce((sum, [start, end]) => sum + (end - start + 1), 0);
      expect(covered).toBe(total);
    }
  });
});
