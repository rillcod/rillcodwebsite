import { NextRequest, NextResponse } from 'next/server';
import { createEngagementAdminClient } from '@/lib/supabase/admin';
import {
  requireLiveSessionUser,
  canManageLiveSession,
  LiveSessionAuthError,
} from '@/lib/live-sessions/authz';
import { roomServiceClient, roomNameForSession } from '@/lib/live-sessions/livekit-server';
import { TrackSource } from 'livekit-server-sdk';

export const dynamic = 'force-dynamic';

// A participant's microphone track(s) — the thing we mute. Match by SOURCE (MICROPHONE),
// which is unambiguous, rather than guessing at TrackType numeric values.
const micTracks = (p: { tracks?: Array<{ sid: string; source?: number; muted?: boolean }> }) =>
  (p.tracks ?? []).filter((t) => t.source === TrackSource.MICROPHONE);

// POST /api/live-sessions/[id]/moderate
// Host-only in-call moderation. Body:
//   { action: 'mute'|'unmute', identity }         → mute/unmute one participant's mic
//   { action: 'muteAll' }                          → mute every non-host mic
//   { action: 'remove', identity }                 → remove (kick) a participant
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const caller = await requireLiveSessionUser();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createEngagementAdminClient();
  const { data: session } = await admin
    .from('live_sessions')
    .select('id, host_id, school_id, program_id, status')
    .eq('id', id)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  // Only the host / admin / owning school may moderate.
  const isModerator = await canManageLiveSession(admin as any, caller, session);
  if (!isModerator) {
    return NextResponse.json({ error: 'Only the host can moderate this session.' }, { status: 403 });
  }

  const svc = roomServiceClient();
  if (!svc) return NextResponse.json({ error: 'Live video is not configured on this server.' }, { status: 500 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action ?? '');
  const identity = typeof body.identity === 'string' ? body.identity : null;
  const room = roomNameForSession(id);

  try {
    if (action === 'remove') {
      if (!identity) return NextResponse.json({ error: 'identity required' }, { status: 400 });
      await svc.removeParticipant(room, identity);
      return NextResponse.json({ ok: true, action, identity });
    }

    if (action === 'mute' || action === 'unmute') {
      if (!identity) return NextResponse.json({ error: 'identity required' }, { status: 400 });
      const muted = action === 'mute';
      const p = await svc.getParticipant(room, identity);
      const audio = micTracks(p as any);
      for (const t of audio) await svc.mutePublishedTrack(room, identity, t.sid, muted);
      return NextResponse.json({ ok: true, action, identity, tracks: audio.length });
    }

    if (action === 'muteAll') {
      const participants = await svc.listParticipants(room);
      let muted = 0;
      for (const p of participants) {
        if (p.identity === session.host_id || p.identity === caller.id) continue; // never mute the host
        for (const t of micTracks(p as any)) {
          if (!t.muted) { await svc.mutePublishedTrack(room, p.identity, t.sid, true); muted++; }
        }
      }
      return NextResponse.json({ ok: true, action, muted });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    if (err instanceof LiveSessionAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    // LiveKit throws when the participant/room isn't found (e.g. already left) — surface softly.
    return NextResponse.json({ error: err?.message ?? 'Moderation failed' }, { status: 502 });
  }
}
