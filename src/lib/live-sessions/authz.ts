import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { getTeacherSchoolIds as resolveTeacherSchoolIds } from '@/lib/auth-utils';

export type LiveSessionCaller = {
  id: string;
  role: string | null;
  school_id?: string | null;
  full_name?: string | null;
};

export type LiveSessionScope = {
  id: string;
  host_id: string | null;
  school_id: string | null;
  program_id: string | null;
  status?: string | null;
  scheduled_at?: string | null;
  duration_minutes?: number | null;
};

export class LiveSessionAuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Live-session-shaped wrapper (admin client first) over the canonical resolver
 * in `@/lib/auth-utils`. Kept so the existing call sites read naturally; the
 * rule itself is defined in exactly one place.
 */
export async function getTeacherSchoolIds(admin: SupabaseClient, teacherId: string, primarySchoolId?: string | null) {
  return resolveTeacherSchoolIds(teacherId, primarySchoolId ?? null, admin);
}

export async function getStudentProgramIds(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from('enrollments')
    .select('program_id')
    .eq('user_id', userId)
    .in('status', ['active', 'enrolled', 'approved']);

  if (error) throw error;

  const ids = new Set((data ?? []).map((row: any) => row.program_id).filter(Boolean) as string[]);

  // School students often inherit programme access from their class placement
  // rather than a separate enrollment row.
  const { data: profile } = await admin
    .from('portal_users')
    .select('class_id')
    .eq('id', userId)
    .maybeSingle();
  const classId = (profile as any)?.class_id ?? null;
  if (classId) {
    const { data: klass } = await admin
      .from('classes')
      .select('program_id')
      .eq('id', classId)
      .maybeSingle();
    if ((klass as any)?.program_id) ids.add((klass as any).program_id);
  }

  return [...ids];
}

/** Schools a student belongs to — profile school first, class school only as fallback. */
export async function resolveStudentSchoolId(
  admin: SupabaseClient,
  userId: string,
  primarySchoolId?: string | null,
): Promise<string | null> {
  if (primarySchoolId) return primarySchoolId;

  const { data: profile } = await admin
    .from('portal_users')
    .select('school_id, class_id')
    .eq('id', userId)
    .maybeSingle();

  const profileSchool = (profile as any)?.school_id ?? null;
  if (profileSchool) return profileSchool;

  const classId = (profile as any)?.class_id ?? null;
  if (!classId) return null;

  const { data: klass } = await admin
    .from('classes')
    .select('school_id')
    .eq('id', classId)
    .maybeSingle();

  return (klass as any)?.school_id ?? null;
}

/** @deprecated Prefer resolveStudentSchoolId — school first, then class. */
export async function getStudentSchoolIds(
  admin: SupabaseClient,
  userId: string,
  primarySchoolId?: string | null,
) {
  const id = await resolveStudentSchoolId(admin, userId, primarySchoolId);
  return id ? [id] : [];
}

export async function canAccessLiveSession(
  admin: SupabaseClient,
  caller: LiveSessionCaller,
  session: LiveSessionScope,
) {
  if (caller.role === 'admin') return true;
  if (session.host_id && session.host_id === caller.id) return true;

  if (caller.role === 'teacher') {
    const schoolIds = await getTeacherSchoolIds(admin, caller.id, caller.school_id);
    return !!session.school_id && schoolIds.includes(session.school_id);
  }

  if (caller.role === 'school') {
    return !!caller.school_id && !!session.school_id && caller.school_id === session.school_id;
  }

  if (caller.role === 'student') {
    // Open / global session (no school, no programme)
    if (!session.school_id && !session.program_id) return true;

    // School first (profile school, else class school) — never class-over-school.
    if (session.school_id) {
      const schoolId = await resolveStudentSchoolId(admin, caller.id, caller.school_id);
      if (schoolId && schoolId === session.school_id) return true;
    }

    if (session.program_id) {
      const programIds = await getStudentProgramIds(admin, caller.id);
      if (programIds.includes(session.program_id)) return true;
    }

    return false;
  }

  return false;
}

export async function requireLiveSessionAccess(
  admin: SupabaseClient,
  caller: LiveSessionCaller,
  session: LiveSessionScope,
) {
  const allowed = await canAccessLiveSession(admin, caller, session);
  if (!allowed) throw new LiveSessionAuthError('You do not have access to this live session.', 403);
}

export async function canManageLiveSession(
  admin: SupabaseClient,
  caller: LiveSessionCaller,
  session: LiveSessionScope,
) {
  if (caller.role === 'admin') return true;
  if (session.host_id && session.host_id === caller.id) return true;
  if (caller.role === 'school') {
    return !!caller.school_id && !!session.school_id && caller.school_id === session.school_id;
  }
  if (caller.role === 'teacher' && session.school_id) {
    const schoolIds = await getTeacherSchoolIds(admin, caller.id, caller.school_id);
    return schoolIds.includes(session.school_id);
  }
  return false;
}

export async function requireLiveSessionManager(
  admin: SupabaseClient,
  caller: LiveSessionCaller,
  session: LiveSessionScope,
) {
  const allowed = await canManageLiveSession(admin, caller, session);
  if (!allowed) throw new LiveSessionAuthError('You cannot manage this live session.', 403);
}

export async function canCreateLiveSessionForTarget(
  admin: SupabaseClient,
  caller: LiveSessionCaller,
  schoolId?: string | null,
  programId?: string | null,
) {
  if (caller.role === 'admin') return true;
  if (caller.role === 'school') {
    if (!caller.school_id || (schoolId && schoolId !== caller.school_id)) return false;
    if (!programId) return true;
    const { data: program, error } = await admin
      .from('programs')
      .select('school_id')
      .eq('id', programId)
      .maybeSingle();
    if (error) throw error;
    const programSchoolId = (program as any)?.school_id ?? null;
    return !programSchoolId || programSchoolId === caller.school_id;
  }
  if (caller.role !== 'teacher') {
    if (!caller.role || ['student', 'parent'].includes(caller.role)) return false;
    // Non-admin staff are regulated: they must scope to a school or a programme —
    // broadcasting to all schools (no school, no programme) is admin-only.
    if (!schoolId && !programId) return false;
    if (caller.school_id && schoolId && schoolId !== caller.school_id) return false;
    if (programId && caller.school_id) {
      const { data: program, error } = await admin
        .from('programs')
        .select('school_id')
        .eq('id', programId)
        .maybeSingle();
      if (error) throw error;
      const programSchoolId = (program as any)?.school_id ?? null;
      if (programSchoolId && programSchoolId !== caller.school_id) return false;
    }
    return true;
  }

  const teacherSchoolIds = await getTeacherSchoolIds(admin, caller.id, caller.school_id);
  if (schoolId && !teacherSchoolIds.includes(schoolId)) return false;

  if (programId) {
    const { data: program, error } = await admin
      .from('programs')
      .select('school_id')
      .eq('id', programId)
      .maybeSingle();
    if (error) throw error;
    const programSchoolId = (program as any)?.school_id ?? null;
    if (programSchoolId && !teacherSchoolIds.includes(programSchoolId)) return false;
  }

  // Regulated like other non-admin staff: a teacher must scope to one of their
  // schools or an in-scope programme — they cannot broadcast to all schools.
  return schoolId ? teacherSchoolIds.includes(schoolId) : !!programId;
}

/** How early a student may enter a session the host has not started yet. */
export const JOIN_EARLY_MS = 30 * 60_000;
/**
 * How long after a scheduled session's nominal end it stays joinable. Deliberately generous:
 * durations are a guess, and locking a class out of a lesson that overran is far worse than
 * leaving a dead room reachable for an afternoon.
 */
export const JOIN_LATE_GRACE_MS = 4 * 60 * 60_000;

/**
 * Is this session open for a non-moderator to join?
 *
 * This used to read `status === 'live' || status === 'scheduled'` — it selected scheduled_at
 * and duration_minutes and then ignored both, so a student could walk into a session
 * scheduled for next month while the error message claimed there was a window.
 *
 * `live` is always open: the host explicitly started it, and a class that runs past its
 * nominal duration must never eject the students sitting in it.
 */
export function isSessionJoinWindowOpen(session: LiveSessionScope, now: number = Date.now()) {
  if (session.status === 'live') return true;
  if (session.status !== 'scheduled') return false;

  // No usable schedule — fail open rather than invent a window.
  const startsAt = session.scheduled_at ? new Date(session.scheduled_at).getTime() : NaN;
  if (!Number.isFinite(startsAt)) return true;

  const durationMs = (Number(session.duration_minutes) || 60) * 60_000;
  return now >= startsAt - JOIN_EARLY_MS && now <= startsAt + durationMs + JOIN_LATE_GRACE_MS;
}

// ── Host removals ─────────────────────────────────────────────────────────────

/**
 * Shown to a participant the host kicked. The meeting client matches on this text to stop
 * auto-rejoining, so keep it in sync with FATAL_JOIN_ERROR in `rejoin-policy.ts`.
 */
export const LIVE_SESSION_REMOVED_MESSAGE =
  'You were removed from this session by the host.';

/**
 * Did the host kick this person out of this session?
 *
 * LiveKit's removeParticipant only closes the socket — the client sees an ordinary drop and
 * rejoins within seconds with a fresh token. Every seat-issuing path has to consult this, or
 * "Remove" is decorative. Cleared by the host re-admitting them (the row is deleted).
 */
export async function isRemovedFromLiveSession(
  admin: SupabaseClient,
  sessionId: string,
  userId: string,
): Promise<boolean> {
  if (!sessionId || !userId) return false;
  const { data, error } = await (admin as any)
    .from('live_session_removals')
    .select('id')
    .eq('session_id', sessionId)
    .eq('portal_user_id', userId)
    .maybeSingle();
  // Fail open: a lookup error must not lock a whole class out of their lesson.
  if (error) {
    console.warn('[live-sessions] removal lookup failed', error.message);
    return false;
  }
  return !!data;
}

// ── Shared caller resolution (one implementation for every live-session route) ──

/** Authenticated caller + profile, or null. Used by all live-session routes. */
export async function requireLiveSessionUser(): Promise<LiveSessionCaller | null> {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id, full_name')
    .eq('id', user.id)
    .single();
  return (profile as LiveSessionCaller | null) ?? null;
}

/** As above but rejects students/parents — for create/update/manage routes. */
export async function requireLiveSessionStaff(): Promise<LiveSessionCaller | null> {
  const caller = await requireLiveSessionUser();
  if (!caller || ['student', 'parent'].includes(caller.role ?? '')) return null;
  return caller;
}
