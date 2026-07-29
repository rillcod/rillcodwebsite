import { describe, expect, it } from 'vitest';
import { chooseLeastLoadedTeacher } from '@/lib/classes/teacher-allocation';

describe('teacher allocation', () => {
  it('chooses the active teacher with the lightest class load', () => {
    const result = chooseLeastLoadedTeacher([
      { id: 'teacher-a', full_name: 'Amaka', is_active: true },
      { id: 'teacher-b', full_name: 'Sulemani', is_active: true },
    ], { 'teacher-a': 4, 'teacher-b': 1 });
    expect(result?.id).toBe('teacher-b');
  });

  it('uses a stable human-readable tie break and ignores inactive teachers', () => {
    const result = chooseLeastLoadedTeacher([
      { id: 'teacher-z', full_name: 'Zainab', is_active: false },
      { id: 'teacher-s', full_name: 'Sulemani', is_active: true },
      { id: 'teacher-a', full_name: 'Amaka', is_active: true },
    ], {});
    expect(result?.id).toBe('teacher-a');
  });

  it('returns null when no eligible teacher exists', () => {
    expect(chooseLeastLoadedTeacher([
      { id: 'teacher-a', is_active: false },
      { id: 'teacher-b', is_deleted: true },
    ], {})).toBeNull();
  });
});
