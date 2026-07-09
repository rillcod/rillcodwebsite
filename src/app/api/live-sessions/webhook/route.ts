import { NextRequest, NextResponse } from 'next/server';
import { WebhookReceiver, EgressStatus } from 'livekit-server-sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { livekitEnv } from '@/lib/live-sessions/livekit-server';
import type { Database } from '@/types/supabase';

type RecordingUpdate = Database['public']['Tables']['session_recordings']['Update'];

export const dynamic = 'force-dynamic';

// POST /api/live-sessions/webhook
// LiveKit posts room/egress events here. We use egress_ended / egress_updated to finalise
// a session_recordings row once the MP4 is uploaded to R2 — flipping it to 'ready' (or
// 'failed') and stamping the size/duration so students can rewatch it.
export async function POST(req: NextRequest) {
  const env = livekitEnv();
  if (!env) return NextResponse.json({ error: 'LiveKit not configured' }, { status: 500 });

  const receiver = new WebhookReceiver(env.apiKey, env.apiSecret);
  const body = await req.text();
  const authHeader = req.headers.get('Authorization') || '';

  let event: any;
  try {
    event = await receiver.receive(body, authHeader);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const kind = event?.event as string | undefined;
  const info = event?.egressInfo;
  if (!kind || !kind.startsWith('egress') || !info?.egressId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const admin = createAdminClient();
  // Use the real enum (status may arrive as the numeric enum OR its string name). egress_ended
  // fires on terminal states; treat a non-failed terminal as complete.
  const statusStr = String(info.status ?? '');
  const isFailed = info.status === EgressStatus.EGRESS_FAILED
    || info.status === EgressStatus.EGRESS_ABORTED
    || statusStr === 'EGRESS_FAILED' || statusStr === 'EGRESS_ABORTED';
  const isComplete = !isFailed && (
    info.status === EgressStatus.EGRESS_COMPLETE
    || statusStr === 'EGRESS_COMPLETE'
    || kind === 'egress_ended'
  );

  const file = Array.isArray(info.fileResults) && info.fileResults.length > 0
    ? info.fileResults[0]
    : info.file ?? null;

  const patch: RecordingUpdate = { updated_at: new Date().toISOString() };
  if (isFailed) {
    patch.status = 'failed';
    patch.error = info.error || 'Egress failed';
  } else if (isComplete) {
    patch.status = 'ready';
    patch.ended_at = new Date().toISOString();
    if (file?.filename) patch.r2_key = String(file.filename).replace(/^\/+/, '');
    // duration comes back in nanoseconds; size in bytes (both may be bigint).
    if (file?.duration != null) patch.duration_seconds = Math.round(Number(file.duration) / 1e9) || null;
    if (file?.size != null) patch.size_bytes = Number(file.size) || null;
  } else {
    return NextResponse.json({ ok: true, noop: true });
  }

  await admin.from('session_recordings').update(patch).eq('egress_id', info.egressId);
  return NextResponse.json({ ok: true });
}
