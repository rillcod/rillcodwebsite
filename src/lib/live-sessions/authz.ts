import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

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

export async function getTeacherSchoolIds(admin: SupabaseClient, teacherId: string, primarySchoolId?: string | null) {
  const ids = new Set<string>();
  if (primarySchoolId) ids.add(primarySchoolId);

  const { data, error } = await admin
    .from('teacher_schools')
    .select('school_id')
    .eq('teacher_id', teacherId);

  if (error) throw error;
  for (const row of data ?? []) {
    if ((row as any).school_id) ids.add((row as any).school_id);
  }

  return [...ids];
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
    if (!session.school_id && !session.program_id) return true;
    const programIds = session.program_id
      ? await getStudentProgramIds(admin, caller.id)
      : [];
    if (session.program_id && programIds.includes(session.program_id)) return true;
    // A school-scoped live session is intentionally broad: every student in that
    // school can join, even without a separate programme enrollment row.
    if (session.school_id && caller.school_id === session.school_id) return true;
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
  if (caller.role !== 'teacher') return false;

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

export function isSessionJoinWindowOpen(session: LiveSessionScope) {
  return session.status === 'live' || session.status === 'scheduled';
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
