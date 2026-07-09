import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  requireLiveSessionUser,
  requireLiveSessionAccess,
  canManageLiveSession,
  LiveSessionAuthError,
} from '@/lib/live-sessions/authz';
import { r2SignedUrl } from '@/lib/r2/client';
import { reconcilePendingRecordings } from '@/lib/live-sessions/livekit-server';

export const dynamic = 'force-dynamic';

// GET /api/live-sessions/[id]/recordings
// Ready recordings for this session, each with a short-lived signed R2 playback URL.
// Access-scoped: anyone who could join the session (host, staff, enrolled students) can rewatch.
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const caller = await requireLiveSessionUser();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: session } = await admin
    .from('live_sessions')
    .select('id, host_id, school_id, program_id, status')
    .eq('id', id)
    .maybeSingle();
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  try {
    await requireLiveSessionAccess(admin as any, caller, session);
  } catch (err) {
    if (err instanceof LiveSessionAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const isModerator = await canManageLiveSession(admin as any, caller, session);

  // Self-heal any in-flight recordings (finalise even if the LiveKit webhook was missed).
  await reconcilePendingRecordings(admin, id);

  // Students only see finished ('ready') replays; the host also sees in-progress ones.
  const statuses = isModerator ? ['ready', 'processing', 'recording', 'failed'] : ['ready'];
  const { data: rows } = await admin
    .from('session_recordings')
    .select('id, title, status, duration_seconds, size_bytes, r2_key, started_at, ended_at')
    .eq('session_id', id)
    .in('status', statuses)
    .order('started_at', { ascending: false });

  const recordings = await Promise.all((rows ?? []).map(async (r: any) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    duration_seconds: r.duration_seconds,
    size_bytes: r.size_bytes,
    started_at: r.started_at,
    ended_at: r.ended_at,
    // Signed URL only when the file exists (ready). 6h TTL — long enough to watch, short
    // enough that the link can't be shared indefinitely.
    playback_url: r.status === 'ready' && r.r2_key ? await r2SignedUrl(r.r2_key, 6 * 3600) : null,
  })));

  return NextResponse.json({ recordings, canManage: isModerator });
}
