import type { SupabaseClient } from '@supabase/supabase-js';
import { getAttendanceThreshold } from './lms-policy';

type AnySupabase = SupabaseClient<any>;

/**
 * A student's live-session attendance %, computed live:
 *   attended distinct sessions / applicable past sessions.
 * "Applicable" = live sessions in the student's school (or global broadcasts) that have already
 * happened. Returns 100 when there are no applicable sessions (nothing to attend → no penalty).
 */
export async function getStudentAttendancePct(admin: AnySupabase, studentId: string): Promise<number> {
  const { data: student } = await admin
    .from('portal_users').select('school_id').eq('id', studentId).maybeSingle();
  const schoolId = (student as { school_id?: string | null } | null)?.school_id ?? null;

  // Past sessions the student was expected at (their school + global broadcasts).
  const nowIso = new Date().toISOString();
  let sq = admin.from('live_sessions').select('id').lte('scheduled_at', nowIso);
  sq = schoolId ? (sq.or(`school_id.eq.${schoolId},school_id.is.null`) as typeof sq) : (sq.is('school_id', null) as typeof sq);
  const { data: applicable } = await sq;
  const applicableIds = new Set((applicable ?? []).map((s: any) => s.id));
  if (applicableIds.size === 0) return 100;

  const { data: attended } = await admin
    .from('live_session_attendance').select('session_id').eq('portal_user_id', studentId);
  const attendedIds = new Set((attended ?? []).map((a: any) => a.session_id).filter((id: string) => applicableIds.has(id)));

  return Math.round((attendedIds.size / applicableIds.size) * 100);
}

/**
 * Exam-eligibility gate for "lms_attendance_threshold". Fails OPEN: if the setting is 0/absent
 * or attendance can't be computed, the student is never wrongly blocked.
 */
export async function checkExamAttendanceEligibility(
  admin: AnySupabase,
  studentId: string,
): Promise<{ eligible: boolean; pct: number; threshold: number }> {
  const threshold = await getAttendanceThreshold(admin);
  if (!threshold || threshold <= 0) return { eligible: true, pct: 100, threshold: 0 };
  try {
    const pct = await getStudentAttendancePct(admin, studentId);
    return { eligible: pct >= threshold, pct, threshold };
  } catch {
    return { eligible: true, pct: 100, threshold };
  }
}
