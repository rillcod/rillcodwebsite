import { describe, expect, it } from 'vitest';
import { classifyRebuildableClassDeleteError } from './delete-rebuildable-class';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

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

  it('protects legacy metadata-targeted attempts in app and database delete paths', () => {
    const implementation = readFileSync(join(ROOT, 'lib/operations/delete-rebuildable-class.ts'), 'utf8');
    const migration = readFileSync(join(
      ROOT,
      '../supabase/migrations/20260929000108_protect_legacy_class_target_evidence.sql',
    ), 'utf8');

    expect(implementation).toContain('metadata->>target_class_id.eq.${classId}');
    expect(implementation).toContain("deleteError.message?.includes('PROTECTED_ACADEMIC_EVIDENCE')");
    expect(migration).toContain("metadata ->> 'target_class_id' = old.id::text");
    expect(migration).toContain('public.exam_attempts');
    expect(migration).toContain('before delete on public.classes');
  });
});
