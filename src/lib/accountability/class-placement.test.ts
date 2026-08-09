import { describe, expect, it } from 'vitest';
import { isActiveRosterStatus, resolveActiveRosterPlacements } from './class-placement';

describe('accountability class placement', () => {
  it('ignores ended roster rows', () => {
    expect(isActiveRosterStatus('withdrawn')).toBe(false);
    expect(isActiveRosterStatus('active')).toBe(true);
    expect(resolveActiveRosterPlacements([{ student_id: 's1', class_id: 'c1', status: 'ended' }]).placements.size).toBe(0);
  });

  it('resolves duplicate rows for the same class once', () => {
    const result = resolveActiveRosterPlacements([
      { student_id: 's1', class_id: 'c1', status: 'active' },
      { student_id: 's1', class_id: 'c1', status: null },
    ]);
    expect([...result.placements]).toEqual([['s1', 'c1']]);
    expect(result.conflicts.size).toBe(0);
  });

  it('quarantines conflicting active classes instead of choosing one', () => {
    const result = resolveActiveRosterPlacements([
      { student_id: 's1', class_id: 'c1', status: 'active' },
      { student_id: 's1', class_id: 'c2', status: 'active' },
    ]);
    expect(result.placements.has('s1')).toBe(false);
    expect(result.conflicts.has('s1')).toBe(true);
  });
});
