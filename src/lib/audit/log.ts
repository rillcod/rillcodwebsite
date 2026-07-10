import type { SupabaseClient } from '@supabase/supabase-js';

type AnySupabase = SupabaseClient<any>;

/** The single, standard shape for one audit-trail entry. */
export interface AuditEntry {
  /** Machine action name, snake_case verb_object — e.g. 'delete_school', 'grade_submission'. */
  action: string;
  /** The staff/user who performed it. Sets BOTH actor_id and user_id so the actor always resolves. */
  actorId?: string | null;
  /** What kind of thing was acted on — e.g. 'school', 'assignment_submission', 'receipt'. */
  resourceType?: string | null;
  /** The id of that thing. */
  resourceId?: string | null;
  /** Underlying table + row id, when useful for forensics. */
  tableName?: string | null;
  recordId?: string | null;
  /** Human-readable before/after (short strings). */
  oldValue?: string | null;
  newValue?: string | null;
  /** Structured before/after snapshots. */
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  /** Request context (for public / unauthenticated events). */
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Append ONE audit_logs entry — the single, canonical way to write the trail.
 * Non-throwing: auditing must never break the action it records.
 *
 * Key invariant: user_id is kept in sync with actor_id, because the Activity Logs UI
 * resolves the actor through audit_logs.user_id → portal_users. Writing actor_id alone
 * (as several old call-sites did) left every entry showing "no user".
 */
export async function logAudit(admin: AnySupabase, entry: AuditEntry): Promise<void> {
  try {
    const actor = entry.actorId ?? null;
    await admin.from('audit_logs').insert({
      action: entry.action,
      actor_id: actor,
      user_id: actor,
      resource_type: entry.resourceType ?? null,
      resource_id: entry.resourceId ?? null,
      table_name: entry.tableName ?? null,
      record_id: entry.recordId ?? entry.resourceId ?? null,
      old_value: entry.oldValue ?? null,
      new_value: entry.newValue ?? null,
      old_values: (entry.oldValues ?? null) as any,
      new_values: (entry.newValues ?? null) as any,
      ip_address: entry.ip ?? null,
      user_agent: entry.userAgent ?? null,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[logAudit] failed (non-fatal):', err);
  }
}
