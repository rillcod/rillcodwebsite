import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Resolve who is opted in to a notification category.
 *
 * A user with NO `notification_preferences` row is opted IN. This mirrors
 * `preferences.service.ts`, which returns all-on DEFAULTS when the row is absent —
 * so the settings screen already shows these categories as enabled. Rows are only
 * ever written when someone edits their settings, so treating "no row" as opted out
 * (which is what the cron jobs used to do by filtering `.eq(key, true)` on the table)
 * meant every retention job addressed an empty audience while the UI told users they
 * were subscribed. Absence means "never expressed a preference", not "declined".
 *
 * Only an explicit `false` suppresses delivery.
 */
export async function resolveOptedInUsers(
  db: SupabaseClient<any>,
  opts: {
    role: 'student' | 'parent' | 'teacher' | 'school' | 'admin';
    prefKey: 'streak_reminder' | 'weekly_summary' | 'attendance_alerts';
    limit?: number;
  },
): Promise<Array<{ id: string; full_name: string | null; email: string | null }>> {
  const users: Array<{ id: string; full_name: string | null; email: string | null }> = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from('portal_users')
      .select('id, full_name, email')
      .eq('role', opts.role)
      .eq('is_active', true)
      .neq('is_deleted', true)
      .order('id')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Could not load ${opts.role} accounts: ${error.message}`);
    users.push(...((data ?? []) as typeof users));
    if (!data || data.length < pageSize) break;
  }

  // Only explicit opt-outs matter, so we need the rows that say `false`.
  const optedOut = new Set<string>();
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from('notification_preferences')
      .select(`portal_user_id, ${opts.prefKey}`)
      .eq(opts.prefKey, false)
      .order('portal_user_id')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Could not load notification preferences: ${error.message}`);
    for (const row of (data ?? []) as Array<{ portal_user_id: string }>) {
      optedOut.add(row.portal_user_id);
    }
    if (!data || data.length < pageSize) break;
  }

  const eligible = users.filter((u) => !optedOut.has(u.id));
  return typeof opts.limit === 'number' ? eligible.slice(0, opts.limit) : eligible;
}
