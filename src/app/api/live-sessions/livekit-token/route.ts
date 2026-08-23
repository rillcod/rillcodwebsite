import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createEngagementAdminClient } from '@/lib/supabase/admin';
import {
  canManageLiveSession,
  isRemovedFromLiveSession,
  isSessionJoinWindowOpen,
  LIVE_SESSION_REMOVED_MESSAGE,
  LiveSessionAuthError,
  requireLiveSessionAccess,
  requireLiveSessionUser,
} from '@/lib/live-sessions/authz';
import {
  clearStaleLiveKitParticipant,
  ensureLiveKitRoom,
  roomNameForSession,
} from '@/lib/live-sessions/livekit-server';
import { checkLiveKitJoinCapacity } from '@/lib/live-sessions/capacity';

/** Browser client needs ws(s):// — tolerate http(s):// or a bare host in env. */
function clientLiveKitUrl(url: string) {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (/^wss?:\/\//i.test(trimmed)) return trimmed;
  if (/^https:\/\//i.test(trimmed)) return trimmed.replace(/^https:\/\//i, 'wss://');
  if (/^http:\/\//i.test(trimmed)) return trimmed.replace(/^http:\/\//i, 'ws://');
  return `wss://${trimmed}`;
}

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
    // A kicked participant must not be handed a fresh seat — their client auto-rejoins within
    // seconds of being dropped, which is what made "Remove" a no-op. Moderators are exempt so
    // a host can never lock themselves out of their own class.
    if (!isModerator && await isRemovedFromLiveSession(admin as any, sessionId, profile.id)) {
      return NextResponse.json({ error: LIVE_SESSION_REMOVED_MESSAGE }, { status: 403 });
    }
    if (!isModerator && !isSessionJoinWindowOpen(session)) {
      return NextResponse.json({ error: 'This session is not open for joining yet.' }, { status: 403 });
    }
    if (['completed', 'cancelled'].includes(String(session.status))) {
      return NextResponse.json({ error: 'This session is no longer active.' }, { status: 400 });
    }

    const displayName = profile?.full_name ?? 'Participant';
    const roomName = roomNameForSession(sessionId);
    const identity = profile.id;

    // Open the room + clear any ghost seat for this identity before minting.
    // Ghosts from a reconnect loop reject the next join as DUPLICATE_IDENTITY
    // and the UI sits on Connecting. Cap wait so a slow admin API never blocks
    // the token forever.
    await Promise.race([
      Promise.all([
        ensureLiveKitRoom(sessionId),
        clearStaleLiveKitParticipant(sessionId, identity),
      ]),
      new Promise<void>((resolve) => setTimeout(resolve, 2500)),
    ]);

    const at = new AccessToken(API_KEY, API_SECRET, {
      identity,
      name: displayName,
      ttl: '12h',
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      // Anyone in the session can open the room (host may still be connecting).
      roomCreate: true,
      roomAdmin: isModerator,
    });

    const token = await at.toJwt();
    const url = clientLiveKitUrl(LIVEKIT_URL);

    // A minted token proves nothing about whether LiveKit will accept the join:
    // signing happens here, with no network involved. When the account is out of
    // connection minutes LiveKit refuses the browser's join with a 429 that the
    // client SDK retries silently, so the class sits on "Connecting…" and no part of
    // our own system reports a failure. Ask once, briefly, so the teacher is told.
    //
    // Fail-open by construction: anything short of an explicit capacity refusal
    // returns not-blocked, so this can add an explanation but never cause an outage.
    const capacity = await checkLiveKitJoinCapacity({ wsUrl: url, token });
    if (capacity.blocked) {
      console.error('[livekit] join refused for capacity', { roomName, identity });
      return NextResponse.json({ error: capacity.message }, { status: 503 });
    }

    return NextResponse.json({
      token,
      url,
      roomName,
      isModerator,
      displayName,
    });
  } catch (err: any) {
    console.error('[livekit-token]', err);
    return NextResponse.json({ error: err.message ?? 'Token generation failed' }, { status: 500 });
  }
}
