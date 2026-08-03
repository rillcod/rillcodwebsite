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

/** LiveKit identity IS the portal_users id — reject anything that can't be one. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `live_session_removals` is missing — i.e. migration 20260929000022 has not been applied yet.
 * Degrade to the old behaviour (kick, but they can rejoin) rather than failing the click:
 * a host mid-lesson should still be able to eject someone disruptive, even if it doesn't stick.
 */
function isMissingRemovalsTable(err: { code?: string; message?: string } | null) {
  if (!err) return false;
  return err.code === '42P01' || err.code === 'PGRST205' || /live_session_removals/i.test(err.message ?? '');
}

// A participant's microphone track(s) — the thing we mute. Match by SOURCE (MICROPHONE),
// which is unambiguous, rather than guessing at TrackType numeric values.
const micTracks = (p: { tracks?: Array<{ sid: string; source?: number; muted?: boolean }> }) =>
  (p.tracks ?? []).filter((t) => t.source === TrackSource.MICROPHONE);

/** Load the session and confirm the caller may moderate it. */
async function requireModerator(id: string) {
  const caller = await requireLiveSessionUser();
  if (!caller) return { error: 'Unauthorized', status: 401 as const };

  const admin = createEngagementAdminClient();
  const { data: session } = await admin
    .from('live_sessions')
    .select('id, host_id, school_id, program_id, status')
    .eq('id', id)
    .maybeSingle();
  if (!session) return { error: 'Session not found', status: 404 as const };

  // Only the host / admin / owning school may moderate.
  const isModerator = await canManageLiveSession(admin as any, caller, session);
  if (!isModerator) return { error: 'Only the host can moderate this session.', status: 403 as const };

  return { admin, caller, session };
}

// GET /api/live-sessions/[id]/moderate — who is currently removed from this session.
// The participants panel only lists people who are connected, so without this the host has
// no way to see (or undo) a removal once the person is gone.
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const ctx = await requireModerator(id);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { data, error } = await ctx.admin
    .from('live_session_removals')
    .select('portal_user_id, removed_at, portal_users!live_session_removals_user_fkey(full_name)')
    .eq('session_id', id)
    .order('removed_at', { ascending: false });

  // Before the migration lands there is simply nobody removed — an empty list, not an error
  // that would break the whole host panel.
  if (error && isMissingRemovalsTable(error)) return NextResponse.json({ removed: [] });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    removed: (data ?? []).map((r: any) => ({
      identity: r.portal_user_id,
      name: r.portal_users?.full_name ?? 'Participant',
      removed_at: r.removed_at,
    })),
  });
}

// POST /api/live-sessions/[id]/moderate
// Host-only in-call moderation. Body:
//   { action: 'mute'|'unmute', identity }         → mute/unmute one participant's mic
//   { action: 'muteAll' }                          → mute every non-host mic
//   { action: 'remove', identity }                 → remove (kick) a participant, and keep them out
//   { action: 'readmit', identity }                → undo a removal so they can rejoin
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const ctx = await requireModerator(id);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { admin, caller, session } = ctx;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action ?? '');
  const identity = typeof body.identity === 'string' ? body.identity : null;
  const room = roomNameForSession(id);

  // Re-admitting is pure bookkeeping — it must work even when LiveKit is down, otherwise a
  // host who kicked someone by mistake has no way to undo it.
  if (action === 'readmit') {
    if (!identity) return NextResponse.json({ error: 'identity required' }, { status: 400 });
    const { error } = await admin
      .from('live_session_removals')
      .delete()
      .eq('session_id', id)
      .eq('portal_user_id', identity);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, action, identity });
  }

  const svc = roomServiceClient();
  if (!svc) return NextResponse.json({ error: 'Live video is not configured on this server.' }, { status: 500 });

  try {
    if (action === 'remove') {
      if (!identity) return NextResponse.json({ error: 'identity required' }, { status: 400 });
      // Record the removal BEFORE closing the socket. The client rejoins within ~2s of being
      // dropped, so if the row lands second there is a window where it can get a fresh seat.
      let persisted = false;
      if (UUID.test(identity)) {
        const { error: banErr } = await admin
          .from('live_session_removals')
          .upsert(
            { session_id: id, portal_user_id: identity, removed_by: caller.id, removed_at: new Date().toISOString() },
            { onConflict: 'session_id,portal_user_id' },
          );
        if (banErr && !isMissingRemovalsTable(banErr)) {
          return NextResponse.json(
            { error: `Could not record the removal, so they would rejoin immediately: ${banErr.message}` },
            { status: 500 },
          );
        }
        if (banErr) console.warn('[live-sessions] removal not persisted — apply migration 20260929000022');
        persisted = !banErr;
      }
      await svc.removeParticipant(room, identity);
      return NextResponse.json({ ok: true, action, identity, persisted });
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
