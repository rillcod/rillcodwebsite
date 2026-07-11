import { describe, expect, it } from 'vitest';
import {
  assertSingleParentLink,
  isParentLinkConflict,
  ParentLinkConflictError,
} from './links';

describe('single-parent link invariant', () => {
  it('allows the first parent link', () => {
    expect(() => assertSingleParentLink('student-1', 'parent-a', null)).not.toThrow();
  });

  it('allows idempotent linking to the same parent', () => {
    expect(() => assertSingleParentLink('student-1', 'parent-a', 'parent-a')).not.toThrow();
  });

  it('requires unlink before assigning a different parent', () => {
    let thrown: unknown;
    try {
      assertSingleParentLink('student-1', 'parent-b', 'parent-a');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ParentLinkConflictError);
    expect(isParentLinkConflict(thrown)).toBe(true);
    expect(thrown).toMatchObject({
      code: 'STUDENT_ALREADY_LINKED',
      status: 409,
      studentId: 'student-1',
      existingParentId: 'parent-a',
    });
  });
});
