import { describe, expect, it } from 'vitest';
import { classifyRebuildableClassDeleteError } from './delete-rebuildable-class';

describe('rebuildable class delete errors', () => {
  it('refuses learner evidence without treating it as a missing function', () => {
    expect(classifyRebuildableClassDeleteError({
      message: 'PROTECTED_ACADEMIC_EVIDENCE',
    })).toBe('protected');
  });

  it('falls back only when the atomic command is not deployed yet', () => {
    expect(classifyRebuildableClassDeleteError({ code: 'PGRST202' })).toBe('missing_function');
    expect(classifyRebuildableClassDeleteError({
      message: 'Could not find the function public.delete_rebuildable_class',
    })).toBe('missing_function');
  });

  it('keeps scope and foreign-key refusals distinct from fallback', () => {
    expect(classifyRebuildableClassDeleteError({ code: 'P0002', message: 'CLASS_NOT_FOUND' })).toBe('not_found');
    expect(classifyRebuildableClassDeleteError({ code: '42501' })).toBe('forbidden');
    expect(classifyRebuildableClassDeleteError({ code: '23503' })).toBe('in_use');
    expect(classifyRebuildableClassDeleteError({ code: 'XX000', message: 'boom' })).toBe('failed');
  });
});
