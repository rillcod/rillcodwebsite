import { describe, expect, it } from 'vitest';
import {
  optionalStudentPortalUserId,
  requireStudentPortalUserId,
  studentDisplayName,
} from '@/lib/supabase/id-contract';

describe('student id contract', () => {
  it('resolves display name from full_name or name', () => {
    expect(studentDisplayName({ full_name: 'Ada', name: 'X' })).toBe('Ada');
    expect(studentDisplayName({ name: 'Chidi' })).toBe('Chidi');
  });

  it('requires portal user id for progress queries', () => {
    expect(requireStudentPortalUserId({ user_id: 'uuid-1' })).toBe('uuid-1');
    expect(() => requireStudentPortalUserId({ user_id: null })).toThrow(/no portal login/i);
  });

  it('optional portal user id returns null when missing', () => {
    expect(optionalStudentPortalUserId({ user_id: '' })).toBeNull();
    expect(optionalStudentPortalUserId({ user_id: 'abc' })).toBe('abc');
  });
});
