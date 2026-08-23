import type { SupabaseClient } from '@supabase/supabase-js';

export type CleanupPolicy = 'flexible' | 'standard' | 'strict';

export function parseCleanupPolicy(value: unknown): CleanupPolicy {
  return ['flexible', 'standard', 'strict'].includes(String(value))
    ? value as CleanupPolicy
    : 'flexible';
}

/**
 * Rebuildable drafts remain removable in flexible/standard modes. Strict mode
 * is an administrator-selected hold. Irreplaceable learner/finance evidence is
 * protected separately in every mode and can never be opened by this setting.
 */
export function mayHardDeleteRebuildableContent(policy: CleanupPolicy): boolean {
  return policy !== 'strict';
}

/** Issued operational records are removable only in explicit build mode. */
export function mayHardDeleteIssuedOperationalRecord(policy: CleanupPolicy): boolean {
  return policy === 'flexible';
}

export async function loadCleanupPolicy(db: SupabaseClient<any>): Promise<CleanupPolicy> {
  try {
    const { data, error } = await db.from('app_settings')
      .select('value')
      .eq('key', 'data_cleanup_policy')
      .maybeSingle();
    if (error) throw error;
    return parseCleanupPolicy(data?.value);
  } catch (error) {
    // Build-stage usability wins when configuration is absent. Evidence guards
    // still apply independently, so this fallback cannot expose scores.
    console.warn('[cleanup-policy] using flexible default', error);
    return 'flexible';
  }
}

export const STRICT_CLEANUP_MESSAGE =
  'Strict retention is on in Platform Settings. Change the cleanup policy before permanently removing rebuildable drafts.';

export const ISSUED_RECORD_RETENTION_MESSAGE =
  'This item already contains issued or submitted records. Platform Settings currently retains those records; switch cleanup to Flexible only when intentionally clearing build or test data.';
