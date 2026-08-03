import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  canManageLiveSession,
  isRemovedFromLiveSession,
  isSessionJoinWindowOpen,
  LIVE_SESSION_REMOVED_MESSAGE,
  LiveSessionAuthError,
  requireLiveSessionAccess,
} from '@/lib/live-sessions/authz';

// POST /api/live-sessions/[id]/join — Record attendance for joining student
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient() as any;
  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id, full_name')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  // 1. Check if session exists and caller may access it
  const { data: session, error: sErr } = await admin
    .from('live_sessions')
    .select('id, host_id, school_id, program_id, status, scheduled_at, duration_minutes, session_url')
    .eq('id', sessionId)
    .maybeSingle();

  if (sErr || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  try {
    await requireLiveSessionAccess(admin, profile, session);
  } catch (err: any) {
    if (err instanceof LiveSessionAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const isManager = await canManageLiveSession(admin, profile, session);
  // Removed by the host — don't re-open the attendance row either, or the register shows them
  // present in a class they were ejected from.
  if (!isManager && await isRemovedFromLiveSession(admin, sessionId, user.id)) {
    return NextResponse.json({ error: LIVE_SESSION_REMOVED_MESSAGE }, { status: 403 });
  }
  if (!isManager && !isSessionJoinWindowOpen(session)) {
    return NextResponse.json({ error: 'This session is not open for joining yet.' }, { status: 403 });
  }
  if (isManager && ['completed', 'cancelled'].includes(String(session.status))) {
    return NextResponse.json({ error: 'This session is no longer active.' }, { status: 400 });
  }

  // 2. Record attendance entry without resetting the original join time.
  const { data: existingAttendance } = await admin
    .from('live_session_attendance')
    .select('id')
    .eq('session_id', sessionId)
    .eq('portal_user_id', user.id)
    .maybeSingle();

  const { data: attendance, error: aErr } = existingAttendance
    ? await admin
      .from('live_session_attendance')
      .select()
      .eq('id', existingAttendance.id)
      .single()
    : await admin
    .from('live_session_attendance')
    .insert([
      {
        session_id: sessionId,
        portal_user_id: user.id,
        joined_at: new Date().toISOString(),
      }
    ])
    .select()
    .single();

  if (aErr) {
    console.error('Error recording attendance:', aErr);
    // Continue anyway as we don't want to block the user joining
  }

  return NextResponse.json({ 
    success: true, 
    message: 'Attendance recorded',
    meetingUrl: session.session_url || null,
    data: attendance 
  });
}
