import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createEngagementAdminClient as adminClient } from '@/lib/supabase/admin';
import {
  canCreateLiveSessionForTarget,
  LiveSessionAuthError,
  requireLiveSessionManager,
  requireLiveSessionStaff as requireStaff,
} from '@/lib/live-sessions/authz';
import { notifySessionLive } from '@/lib/live-sessions/notify';

// Auto-log a completed session to CRM interactions for the school and attendees
async function autoLogCRM(session: any, staffName: string) {
  try {
    const db = createAdminClient() as any;
    const when = new Date(session.scheduled_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const content = `Live session "${session.title}" completed (${session.duration_minutes} min, ${when})${session.recording_url ? '. Recording available.' : ''}`;

    // Log for school if scoped to one
    if (session.school_id) {
      const { data: school } = await db.from('schools').select('id, name').eq('id', session.school_id).single();
      if (school) {
        await db.from('crm_interactions').insert({
          contact_id: school.id, contact_type: 'school', contact_name: school.name,
          type: 'meeting', direction: 'outbound', content,
          staff_name: staffName,
        });
      }
    }

    // Log for attendees (live_session_attendance)
    const { data: attendees } = await db
      .from('live_session_attendance')
      .select('portal_user_id, portal_users!live_session_attendance_portal_user_id_fkey(full_name, role)')
      .eq('session_id', session.id);

    const seen = new Set<string>();
    for (const row of (attendees || [])) {
      const uid = row.portal_user_id;
      if (!uid || seen.has(uid)) continue;
      seen.add(uid);
      const name = row.portal_users?.full_name || 'Unknown';
      await db.from('crm_interactions').insert({
        contact_id: uid, contact_type: 'portal_user', contact_name: name,
        type: 'meeting', direction: 'outbound', content,
        staff_name: staffName,
      });
    }
  } catch (e) {
    console.error('[CRM auto-log]', e);
  }
}

// PATCH /api/live-sessions/[id] — update session
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await context.params;
  const body = await request.json();

  const allowed: Record<string, any> = { updated_at: new Date().toISOString() };
  const fields = ['title', 'description', 'platform', 'session_url', 'scheduled_at',
    'duration_minutes', 'school_id', 'program_id', 'status', 'recording_url', 'notes'];
  for (const f of fields) {
    if (body[f] !== undefined) allowed[f] = body[f];
  }
  if (caller.role === 'school') {
    allowed.school_id = caller.school_id;
  }

  const admin = adminClient();

  // Get current session to authorize and detect status changes.
  const { data: before, error: beforeErr } = await admin.from('live_sessions').select('*').eq('id', id).maybeSingle();
  if (beforeErr) return NextResponse.json({ error: beforeErr.message }, { status: 500 });
  if (!before) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  try {
    await requireLiveSessionManager(admin as any, caller, before);
    if (body.school_id !== undefined || body.program_id !== undefined) {
      const canTarget = await canCreateLiveSessionForTarget(
        admin as any,
        caller,
        allowed.school_id ?? before.school_id,
        body.program_id ?? before.program_id,
      );
      if (!canTarget) {
        return NextResponse.json({ error: 'You cannot move this session to that school or programme.' }, { status: 403 });
      }
    }
  } catch (err: any) {
    if (err instanceof LiveSessionAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { data, error } = await admin
    .from('live_sessions')
    .update(allowed)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-log to CRM when a session is marked completed
  if (before?.status !== 'completed' && data?.status === 'completed') {
    autoLogCRM(data, (caller as any).full_name || 'Staff').catch(() => {});
  }

  // Push + in-app notification when session goes live
  if (before?.status !== 'live' && data?.status === 'live') {
    notifySessionLive(data).catch(() => {});
  }

  return NextResponse.json({ data });
}

// DELETE /api/live-sessions/[id] — delete session
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await context.params;
  const admin = adminClient();
  const { data: session, error: fetchErr } = await admin.from('live_sessions').select('*').eq('id', id).maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  try {
    await requireLiveSessionManager(admin as any, caller, session);
  } catch (err: any) {
    if (err instanceof LiveSessionAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { error } = await admin.from('live_sessions').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
