import { describe, expect, it } from 'vitest';
import { parseLogQuery, postgrestEventFilter } from './log-query';

describe('audit log query parsing', () => {
  it('normalizes supported filters', () => {
    const result = parseLogQuery(new URLSearchParams({
      type: 'audit',
      user_id: '123e4567-e89b-42d3-a456-426614174000',
      event_type: 'grade_*,result_check_*',
      access_method: 'qr',
      from: '2026-08-01',
      to: '2026-08-09',
    }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.eventPatterns).toEqual(['grade_*', 'result_check_*']);
    expect(postgrestEventFilter('action', result.value.eventPatterns)).toEqual([
      'action.like.grade_%',
      'action.like.result_check_%',
    ]);
  });

  // Annotated because it.each infers a union of object shapes, and each member
  // then has `undefined`-valued keys that URLSearchParams' Record<string,string>
  // will not accept. Runtime was always fine; only tsc (and so CI) failed.
  it.each<Record<string, string>>([
    { event_type: 'safe,role.eq.admin)' },
    { user_id: 'not-a-uuid' },
    { access_method: 'unknown' },
    { from: 'not-a-date' },
    { from: '2026-08-10', to: '2026-08-01' },
  ])('rejects unsafe or invalid filters: %o', (input) => {
    expect(parseLogQuery(new URLSearchParams(input)).ok).toBe(false);
  });
});
