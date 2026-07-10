import { describe, expect, it } from 'vitest';
import { requiresTeacherTransferRequest } from './transfer-policy';

describe('student transfer policy', () => {
  it('moves directly between classes owned by the same teacher', () => {
    expect(requiresTeacherTransferRequest({ actorRole: 'teacher', currentTeacherId: 'teacher-a', destinationTeacherId: 'teacher-a' })).toBe(false);
  });

  it('requires approval when another teacher owns the source class', () => {
    expect(requiresTeacherTransferRequest({ actorRole: 'teacher', currentTeacherId: 'teacher-b', destinationTeacherId: 'teacher-a' })).toBe(true);
  });

  it('allows admins to repair or move records directly', () => {
    expect(requiresTeacherTransferRequest({ actorRole: 'admin', currentTeacherId: 'teacher-b', destinationTeacherId: 'teacher-a' })).toBe(false);
  });

  it('does not require approval for an unassigned student', () => {
    expect(requiresTeacherTransferRequest({ actorRole: 'teacher', currentTeacherId: null, destinationTeacherId: 'teacher-a' })).toBe(false);
  });
});