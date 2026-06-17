import type { SupabaseClient } from '@supabase/supabase-js';

type AnySupabase = SupabaseClient<any>;

/**
 * Append an audit_logs entry. Non-throwing — auditing must never break the
 * action it records. Use for sensitive operations (payment approvals, deletes…).
 */
export async function logAudit(
  admin: AnySupabase,
  entry: {
    action: string;
    actorId?: string | null;
    resourceType?: string | null;
    resourceId?: string | null;
    newValues?: Record<string, unknown> | null;
    oldValues?: Record<string, unknown> | null;
  },
): Promise<void> {
  try {
    await admin.from('audit_logs').insert({
      action: entry.action,
      actor_id: entry.actorId ?? null,
      user_id: entry.actorId ?? null,
      resource_type: entry.resourceType ?? null,
      resource_id: entry.resourceId ?? null,
      new_values: (entry.newValues ?? null) as any,
      old_values: (entry.oldValues ?? null) as any,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[logAudit] failed (non-fatal):', err);
  }
}
