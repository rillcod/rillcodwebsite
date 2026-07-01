import { NextRequest, NextResponse } from 'next/server';
import { createEngagementAdminClient as adminClient } from '@/lib/supabase/admin';
import {
  canAccessLiveSession,
  canCreateLiveSessionForTarget,
  getStudentProgramIds,
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
    query = query.eq('host_id', caller.id);
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
  const resolvedSchoolId = caller.role === 'school'
    ? caller.school_id
    : school_id || null;
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
