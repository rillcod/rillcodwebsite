import type { SupabaseClient } from '@supabase/supabase-js';

export type MergeDuplicateClassesOk = {
  ok: true;
  movedStudents: number;
  archivedCollidingPlans: number;
};

export type MergeDuplicateClassesFail = {
  ok: false;
  status: number;
  error: string;
  code?: string;
};

export type MergeDuplicateClassesResult = MergeDuplicateClassesOk | MergeDuplicateClassesFail;

export function classifyMergeDuplicateClassError(error: {
  code?: string | null;
  message?: string | null;
}): 'invalid' | 'forbidden' | 'not_found' | 'missing_function' | 'collision' | 'in_use' | 'failed' {
  const code = String(error.code ?? '');
  const message = String(error.message ?? '');
  if (message.includes('INVALID_CLASS_MERGE') || message.includes('CLASS_SCHOOL_MISMATCH')) {
    return 'invalid';
  }
  if (code === 'P0002' || message.includes('CLASS_NOT_FOUND')) return 'not_found';
  if (code === '42501' || message.includes('ACTOR_NOT_ALLOWED') || message.includes('CLASS_OUT_OF_SCOPE')) {
    return 'forbidden';
  }
  if (
    ['PGRST202', '42883'].includes(code)
    || message.toLowerCase().includes('could not find the function')
    || message.toLowerCase().includes('does not exist')
  ) {
    return 'missing_function';
  }
  if (code === '23505') return 'collision';
  if (code === '23503') return 'in_use';
  return 'failed';
}

export const MERGE_UNAVAILABLE_MESSAGE =
  'Class merge is not available on this database yet. Students and records were left on the original classes.';

export const MERGE_COLLISION_MESSAGE =
  'Those two classes share a teaching record that could not be combined. Nothing was moved.';

export const MERGE_IN_USE_MESSAGE =
  'A record still points at the duplicate class. Nothing was moved; please retry.';

export const MERGE_FAILED_MESSAGE =
  'The classes could not be merged safely. Nothing was changed; please retry.';

/**
 * One database command for Heal duplicate-merge. There is no sequential
 * TypeScript fallback — PostgREST cannot move students and delete the shell
 * atomically, and the old path already left half-moved rosters.
 */
export async function mergeDuplicateClasses(input: {
  admin: SupabaseClient<any>;
  sourceClassId: string;
  survivorClassId: string;
  actorId: string;
  sectionLabel?: string | null;
}): Promise<MergeDuplicateClassesResult> {
  if (!input.sourceClassId || !input.survivorClassId || input.sourceClassId === input.survivorClassId) {
    return {
      ok: false,
      status: 400,
      error: 'Those two classes cannot be merged.',
      code: 'INVALID_CLASS_MERGE',
    };
  }

  const merged = await input.admin.rpc('merge_duplicate_classes', {
    p_source_class_id: input.sourceClassId,
    p_survivor_class_id: input.survivorClassId,
    p_actor_id: input.actorId,
    p_section_label: input.sectionLabel ?? null,
  });
  if (!merged.error) {
    const payload = merged.data as {
      moved_students?: number;
      archived_colliding_plans?: number;
    } | null;
    return {
      ok: true,
      movedStudents: Number(payload?.moved_students ?? 0),
      archivedCollidingPlans: Number(payload?.archived_colliding_plans ?? 0),
    };
  }

  const kind = classifyMergeDuplicateClassError(merged.error);
  if (kind === 'missing_function') {
    return { ok: false, status: 503, error: MERGE_UNAVAILABLE_MESSAGE, code: 'MISSING_FUNCTION' };
  }
  if (kind === 'forbidden') {
    return { ok: false, status: 403, error: 'Access denied', code: 'CLASS_OUT_OF_SCOPE' };
  }
  if (kind === 'not_found') {
    return { ok: false, status: 404, error: 'Class not found', code: 'CLASS_NOT_FOUND' };
  }
  if (kind === 'invalid') {
    return { ok: false, status: 400, error: 'Those two classes cannot be merged.', code: 'INVALID_CLASS_MERGE' };
  }

  console.error('[classes.merge] atomic merge failed', {
    sourceClassId: input.sourceClassId,
    survivorClassId: input.survivorClassId,
    code: merged.error.code,
  });
  return {
    ok: false,
    status: kind === 'collision' || kind === 'in_use' ? 409 : 500,
    error: kind === 'collision'
      ? MERGE_COLLISION_MESSAGE
      : kind === 'in_use'
        ? MERGE_IN_USE_MESSAGE
        : MERGE_FAILED_MESSAGE,
    code: kind === 'collision' ? 'UNIQUE_COLLISION' : kind === 'in_use' ? 'CLASS_IN_USE' : 'MERGE_FAILED',
  };
}
