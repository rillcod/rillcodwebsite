import type { SupabaseClient } from '@supabase/supabase-js';

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
    .eq('status', 'active');

  if (error) throw error;
  return [...new Set((data ?? []).map((row: any) => row.program_id).filter(Boolean) as string[])];
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
    if (session.school_id && schoolIds.includes(session.school_id)) return true;
    return false;
  }

  if (caller.role === 'school') {
    return !!caller.school_id && !!session.school_id && caller.school_id === session.school_id;
  }

  if (caller.role === 'student') {
    if (session.school_id && caller.school_id !== session.school_id) return false;
    if (!session.program_id) return !!session.school_id && caller.school_id === session.school_id;
    const programIds = await getStudentProgramIds(admin, caller.id);
    return programIds.includes(session.program_id);
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
  if (caller.role !== 'teacher') return false;

  const schoolIds = await getTeacherSchoolIds(admin, caller.id, caller.school_id);
  return !!session.school_id && schoolIds.includes(session.school_id);
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
  if (caller.role !== 'teacher') return false;

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

  return schoolId ? teacherSchoolIds.includes(schoolId) : true;
}

export function isSessionJoinWindowOpen(session: LiveSessionScope, now = new Date()) {
  if (session.status === 'live') return true;
  if (session.status !== 'scheduled') return false;
  if (!session.scheduled_at) return false;

  const start = new Date(session.scheduled_at);
  const earlyMs = 15 * 60 * 1000;
  const durationMs = Math.max(session.duration_minutes ?? 60, 1) * 60 * 1000;
  const latestJoin = new Date(start.getTime() + durationMs);
  return now.getTime() >= start.getTime() - earlyMs && now.getTime() <= latestJoin.getTime();
}
