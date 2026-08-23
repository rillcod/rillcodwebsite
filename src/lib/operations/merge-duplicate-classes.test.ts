import { describe, expect, it } from 'vitest';
import { classifyMergeDuplicateClassError } from './merge-duplicate-classes';

describe('duplicate class merge errors', () => {
  it('refuses a missing atomic command instead of falling back to sequential writes', () => {
    expect(classifyMergeDuplicateClassError({ code: 'PGRST202' })).toBe('missing_function');
    expect(classifyMergeDuplicateClassError({
      message: 'Could not find the function public.merge_duplicate_classes',
    })).toBe('missing_function');
  });

  it('keeps school, scope, and unique collisions distinct from a generic failure', () => {
    expect(classifyMergeDuplicateClassError({ message: 'CLASS_SCHOOL_MISMATCH' })).toBe('invalid');
    expect(classifyMergeDuplicateClassError({ message: 'INVALID_CLASS_MERGE' })).toBe('invalid');
    expect(classifyMergeDuplicateClassError({ code: 'P0002', message: 'CLASS_NOT_FOUND' })).toBe('not_found');
    expect(classifyMergeDuplicateClassError({ code: '42501' })).toBe('forbidden');
    expect(classifyMergeDuplicateClassError({ code: '23505' })).toBe('collision');
    expect(classifyMergeDuplicateClassError({ code: '23503' })).toBe('in_use');
    expect(classifyMergeDuplicateClassError({ code: 'XX000', message: 'boom' })).toBe('failed');
  });
});
