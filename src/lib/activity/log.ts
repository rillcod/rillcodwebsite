/**
 * Activity is not audit. They answer different questions and belong apart.
 *
 *   audit_logs    — who CHANGED what. An actor, a resource, a before and an
 *                   after. Read when something must be explained or defended.
 *   activity_logs — who USED the platform, and when. Sessions, logins, the
 *                   ordinary traffic of a school day. Read to see whether
 *                   anyone is actually here.
 *
 * The two had drifted into one bad arrangement: audit_logs carried 16,702 rows
 * and worked, while activity_logs sat empty and the activity it was built for —
 * 196 logins and 1,333 dashboard sessions — was being written into
 * crm_interactions instead. Usage data lived in the CRM, where it inflated
 * contact timelines, and the table designed to answer "is anyone using this"
 * could only answer "no".
 *
 * Writes go through the service role. activity_logs has RLS enabled with no
 * policy, so a browser cannot write here and a learner cannot forge their own
 * attendance — the same reason points are awarded server-side.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** Ordinary use of the platform. Extend deliberately — this is not a debug log. */
export type ActivityEvent =
  | 'session_started'
  | 'session_active'
  | 'lesson_opened'
  | 'assignment_opened'
  | 'exam_started'
  | 'report_viewed';

export type ActivityInput = {
  userId: string;
  event: ActivityEvent;
  schoolId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Record one activity event.
 *
 * Never throws. Activity is observational: losing a row matters far less than
 * failing the request a learner was actually making, so a failure here is
 * logged and swallowed rather than surfaced.
 */
export async function logActivity(
  db: Pick<SupabaseClient, 'from'>,
  input: ActivityInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!input.userId || !input.event) return { ok: false, error: 'userId and event are required' };
  try {
    const { error } = await db.from('activity_logs').insert({
      user_id: input.userId,
      school_id: input.schoolId ?? null,
      event_type: input.event,
      metadata: input.metadata ?? {},
      ip_address: input.ip ?? null,
      user_agent: input.userAgent ?? null,
    } as never);
    if (error) {
      console.warn('[activity] could not record %s: %s', input.event, error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    console.warn('[activity] could not record %s', input.event, err);
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}

/**
 * How often the same user's session is recorded.
 *
 * A dashboard load fires on every navigation; without this a single lesson
 * would write dozens of rows and the table would measure clicking, not
 * attendance.
 */
export const SESSION_THROTTLE_MINUTES = 30;

/** True when enough time has passed to record another session for this user. */
export function shouldRecordSession(lastRecordedAt: string | null | undefined, now = new Date()): boolean {
  if (!lastRecordedAt) return true;
  const last = new Date(lastRecordedAt).getTime();
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= SESSION_THROTTLE_MINUTES * 60_000;
}
