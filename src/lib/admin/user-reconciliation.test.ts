import { describe, expect, it } from 'vitest';
import { decideAutomaticOrphanPurge } from './user-reconciliation';

describe('automatic orphan account reconciliation', () => {
  it('allows only an unused learner row to be purged automatically', () => {
    expect(decideAutomaticOrphanPurge('student', 0)).toEqual({ allowed: true, reason: null });
  });

  it('protects every learner with academic evidence', () => {
    expect(decideAutomaticOrphanPurge('student', 1)).toMatchObject({ allowed: false });
  });

  it.each(['admin', 'teacher', 'school', 'parent', ''])('requires manual review for %s ownership', (role) => {
    expect(decideAutomaticOrphanPurge(role, 0)).toMatchObject({ allowed: false });
  });
});

