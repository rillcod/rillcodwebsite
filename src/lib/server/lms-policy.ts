import type { SupabaseClient } from '@supabase/supabase-js';
import { getBoolSetting } from './app-settings';

type AnySupabase = SupabaseClient<any>;

// ── Single source of truth for global LMS policy (app_settings) ──────────────────────────
// One typed shape, one set of keys, one set of defaults — so every enforcement point reads
// the same rule the same way (no scattered getBoolSetting calls with drifting defaults).

export type MessagingPolicy = 'open' | 'support_only' | 'restricted';

export interface LmsPolicies {
  teacherIsolation: boolean;     // lms_teacher_isolation   — teachers see only their own classes
  autoPortals: boolean;          // lms_auto_portals        — new registrations auto-activate a portal account
  gamification: boolean;         // lms_gamification_enabled — XP, badges, leaderboard
  autoCertificates: boolean;     // lms_auto_certificates   — issue a certificate when a course is completed
  courseLocking: boolean;        // lms_course_locking      — lessons unlock in order
  reportIndicator: boolean;      // show_report_indicator   — report-status badges/dots
  pasteClaim: boolean;           // allow_paste_claim_students — paste names → force-claim (sensitive)
  messagingPolicy: MessagingPolicy; // lms_messaging_policy
  attendanceThreshold: number;   // lms_attendance_threshold — min % attendance for exam eligibility
}

export const LMS_POLICY_DEFAULTS: LmsPolicies = {
  teacherIsolation: false,
  autoPortals: true,
  gamification: true,
  autoCertificates: false,
  courseLocking: true,
  reportIndicator: true,
  pasteClaim: false,
  messagingPolicy: 'open',
  attendanceThreshold: 75,
};

const KEYS = [
  'lms_teacher_isolation', 'lms_auto_portals', 'lms_gamification_enabled',
  'lms_auto_certificates', 'lms_course_locking', 'show_report_indicator',
  'allow_paste_claim_students',
  'lms_messaging_policy', 'lms_attendance_threshold',
];

/** Read every LMS policy in ONE query. Fails safe to defaults. */
export async function getLmsPolicies(admin: AnySupabase): Promise<LmsPolicies> {
  try {
    const { data } = await admin.from('app_settings').select('key, value').in('key', KEYS);
    const m = new Map<string, string>((data ?? []).map((r: any) => [r.key, r.value]));
    const bool = (k: string, d: boolean) => (m.has(k) ? m.get(k) === 'true' : d);
    const msg = m.get('lms_messaging_policy');
    return {
      teacherIsolation: bool('lms_teacher_isolation', LMS_POLICY_DEFAULTS.teacherIsolation),
      autoPortals: bool('lms_auto_portals', LMS_POLICY_DEFAULTS.autoPortals),
      gamification: bool('lms_gamification_enabled', LMS_POLICY_DEFAULTS.gamification),
      autoCertificates: bool('lms_auto_certificates', LMS_POLICY_DEFAULTS.autoCertificates),
      courseLocking: bool('lms_course_locking', LMS_POLICY_DEFAULTS.courseLocking),
      reportIndicator: bool('show_report_indicator', LMS_POLICY_DEFAULTS.reportIndicator),
      pasteClaim: bool('allow_paste_claim_students', LMS_POLICY_DEFAULTS.pasteClaim),
      messagingPolicy: (['open', 'support_only', 'restricted'] as const).includes(msg as MessagingPolicy)
        ? (msg as MessagingPolicy) : LMS_POLICY_DEFAULTS.messagingPolicy,
      attendanceThreshold: Number.isFinite(Number(m.get('lms_attendance_threshold')))
        ? Number(m.get('lms_attendance_threshold')) : LMS_POLICY_DEFAULTS.attendanceThreshold,
    };
  } catch {
    return { ...LMS_POLICY_DEFAULTS };
  }
}

// ── Focused single-policy readers (thin, so hot paths don't fetch all 8 keys) ───────────
export const isAutoPortalsOn        = (a: AnySupabase) => getBoolSetting(a, 'lms_auto_portals', LMS_POLICY_DEFAULTS.autoPortals);
export const isCourseLockingOn      = (a: AnySupabase) => getBoolSetting(a, 'lms_course_locking', LMS_POLICY_DEFAULTS.courseLocking);
export const isAutoCertificatesOn   = (a: AnySupabase) => getBoolSetting(a, 'lms_auto_certificates', LMS_POLICY_DEFAULTS.autoCertificates);
export const isGamificationOn       = (a: AnySupabase) => getBoolSetting(a, 'lms_gamification_enabled', LMS_POLICY_DEFAULTS.gamification);
export const isPasteClaimOn         = (a: AnySupabase) => getBoolSetting(a, 'allow_paste_claim_students', LMS_POLICY_DEFAULTS.pasteClaim);

/** Attendance % required for exam eligibility (0 = no gate). */
export async function getAttendanceThreshold(admin: AnySupabase): Promise<number> {
  try {
    const { data } = await admin.from('app_settings').select('value').eq('key', 'lms_attendance_threshold').maybeSingle();
    const n = Number((data as { value?: string } | null)?.value);
    return Number.isFinite(n) ? n : LMS_POLICY_DEFAULTS.attendanceThreshold;
  } catch {
    return LMS_POLICY_DEFAULTS.attendanceThreshold;
  }
}
