import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createEngagementAdminClient } from '@/lib/supabase/admin';
import {
  canManageLiveSession,
  isSessionJoinWindowOpen,
  LiveSessionAuthError,
  requireLiveSessionAccess,
  requireLiveSessionUser,
} from '@/lib/live-sessions/authz';

// POST /api/live-sessions/livekit-token
// Body: { sessionId: string }
// Returns: { token: string, url: string, roomName: string }
export async function POST(req: NextRequest) {
  try {
    const profile = await requireLiveSessionUser();
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { sessionId } = await req.json();
    if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 });

    const API_KEY = process.env.LIVEKIT_API_KEY;
    const API_SECRET = process.env.LIVEKIT_API_SECRET;
    const LIVEKIT_URL = process.env.LIVEKIT_URL;
    if (!API_KEY || !API_SECRET || !LIVEKIT_URL) {
      return NextResponse.json({ error: 'LiveKit is not configured on this server.' }, { status: 500 });
    }

    const admin = createEngagementAdminClient();
    const { data: session, error: sessionErr } = await admin
      .from('live_sessions')
      .select('id, host_id, school_id, program_id, status, scheduled_at, duration_minutes')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionErr) return NextResponse.json({ error: sessionErr.message }, { status: 500 });
    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

    try {
      await requireLiveSessionAccess(admin as any, profile, session);
    } catch (err: any) {
      if (err instanceof LiveSessionAuthError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }

    const isModerator = await canManageLiveSession(admin as any, profile, session);
    if (!isModerator && !isSessionJoinWindowOpen(session)) {
      return NextResponse.json({ error: 'This session is not open for joining yet.' }, { status: 403 });
    }
    if (isModerator && ['completed', 'cancelled'].includes(String(session.status))) {
      return NextResponse.json({ error: 'This session is no longer active.' }, { status: 400 });
    }

    const displayName = profile?.full_name ?? 'Participant';
    const roomName    = `rillcod-${sessionId.slice(0, 12)}`;
    const identity    = profile.id;

    const at = new AccessToken(API_KEY, API_SECRET, {
      identity,
      name: displayName,
      // Generous TTL so a long session (or a device that sleeps and wakes) can still
      // reconnect on the same token; a terminal drop re-issues a fresh one on rejoin.
      ttl: '12h',
    });

    at.addGrant({
      roomJoin:       true,
      room:           roomName,
      canPublish:     true,
      canSubscribe:   true,
      canPublishData: true,
      // Moderator gets room admin privileges
      roomAdmin:      isModerator,
      roomCreate:     isModerator,
    });

    const token = await at.toJwt();

    return NextResponse.json({
      token,
      url:      LIVEKIT_URL,
      roomName,
      isModerator,
      displayName,
    });
  } catch (err: any) {
    console.error('[livekit-token]', err);
    return NextResponse.json({ error: err.message ?? 'Token generation failed' }, { status: 500 });
  }
}
