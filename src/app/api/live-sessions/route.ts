import { NextRequest, NextResponse } from 'next/server';
import { createEngagementAdminClient as adminClient } from '@/lib/supabase/admin';
import {
  canAccessLiveSession,
  canCreateLiveSessionForTarget,
  getStudentProgramIds,
  getTeacherSchoolIds,
  requireLiveSessionUser as requireAuth,
} from '@/lib/live-sessions/authz';
import { notifySessionScheduled } from '@/lib/live-sessions/notify';

// GET /api/live-sessions — list all sessions (role-filtered)
export async function GET(_request: NextRequest) {
  const caller = await requireAuth();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = adminClient();
  let query = admin
    .from('live_sessions')
    .select('*, program:programs(name), host:portal_users!live_sessions_host_id_fkey(full_name, role)')
    .order('scheduled_at', { ascending: true });

  if (caller.role === 'teacher') {
    // A teacher sees sessions they host PLUS sessions belonging to any school they're
    // assigned to (teacher_schools) — this is how the online-school teacher reaches
    // sessions the admin scheduled for the online school. canAccessLiveSession below
    // still gates each row, so this only widens the candidate set, never over-grants.
    const schoolIds = await getTeacherSchoolIds(admin as any, caller.id, caller.school_id);
    const filters: string[] = [`host_id.eq.${caller.id}`];
    if (schoolIds.length > 0) filters.push(`school_id.in.(${schoolIds.join(',')})`);
    query = query.or(filters.join(','));
  } else if (caller.role === 'school') {
    if (!caller.school_id) return NextResponse.json({ data: [] });
    query = query.eq('school_id', caller.school_id);
  } else if (caller.role === 'student') {
    const filters: string[] = ['school_id.is.null'];
    if (caller.school_id) filters.push(`school_id.eq.${caller.school_id}`);
    const programIds = await getStudentProgramIds(admin as any, caller.id);
    if (programIds.length > 0) filters.push(`program_id.in.(${programIds.join(',')})`);
    query = query.or(filters.join(','));
  } else if (caller.role === 'parent' || !caller.role) {
    return NextResponse.json({ data: [] });
  } else if (caller.role !== 'admin') {
    query = query.eq('host_id', caller.id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const scoped = [];
  for (const session of data ?? []) {
    if (await canAccessLiveSession(admin as any, caller, session)) scoped.push(session);
  }
  return NextResponse.json({ data: scoped });
}

// POST /api/live-sessions — create session (staff only)
export async function POST(request: NextRequest) {
  const caller = await requireAuth();
  if (!caller || ['student', 'parent'].includes(caller.role ?? ''))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const {
    title, description, platform, session_url,
    scheduled_at, duration_minutes, school_id,
    program_id, status, recording_url, notes,
  } = body;

  if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

  const admin = adminClient();

  // ── Creation scope regulation ──────────────────────────────────────────────
  // Admin is dominant: may target any school or broadcast globally (school_id null).
  // Every other role is regulated to a school they belong to (or an in-scope
  // programme); only an admin can create an all-schools / global session.
  let resolvedSchoolId: string | null;
  if (caller.role === 'admin') {
    resolvedSchoolId = school_id || null;
  } else if (caller.role === 'school') {
    resolvedSchoolId = caller.school_id || null;
  } else {
    // teacher / other staff — pin to an assigned school when one isn't chosen,
    // so they can't accidentally broadcast to every school.
    const schoolIds = await getTeacherSchoolIds(admin as any, caller.id, caller.school_id);
    if (school_id && schoolIds.includes(school_id)) {
      resolvedSchoolId = school_id;                       // an assigned school they picked
    } else if (program_id) {
      resolvedSchoolId = null;                            // programme-scoped (validated below)
    } else if (caller.school_id && schoolIds.includes(caller.school_id)) {
      resolvedSchoolId = caller.school_id;                // their primary school
    } else {
      resolvedSchoolId = schoolIds[0] ?? null;            // any assigned school, else none
    }
  }

  // A non-admin cannot create a fully-global session (no school AND no programme).
  if (caller.role !== 'admin' && !resolvedSchoolId && !program_id) {
    return NextResponse.json(
      { error: 'Only an administrator can broadcast to all schools. Choose a school or programme.' },
      { status: 403 },
    );
  }

  const canCreate = await canCreateLiveSessionForTarget(admin as any, caller, resolvedSchoolId, program_id || null);
  if (!canCreate) {
    return NextResponse.json({ error: 'You cannot create a live session for that school or programme.' }, { status: 403 });
  }

  const { data, error } = await admin
    .from('live_sessions')
    .insert({
      title: title.trim(),
      description: description?.trim() || null,
      platform: platform ?? 'zoom',
      session_url: session_url?.trim() || null,
      scheduled_at,
      duration_minutes: Number(duration_minutes) || 60,
      school_id: resolvedSchoolId,
      program_id: program_id || null,
      status: status ?? 'scheduled',
      recording_url: recording_url?.trim() || null,
      notes: notes?.trim() || null,
      host_id: caller.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify the targeted students that a session has been scheduled (fire-and-forget).
  if (data && data.status === 'scheduled') void notifySessionScheduled(data);

  return NextResponse.json({ data });
}
