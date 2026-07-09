import {
  RoomServiceClient,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  EgressStatus,
  S3Upload,
} from 'livekit-server-sdk';

// Central LiveKit server config — one place so token issuing, moderation (mute/kick) and
// recording (Egress) all agree on the room name and credentials.

export function livekitEnv() {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !url) return null;
  return { apiKey, apiSecret, url };
}

/** HTTP(S) base for the server SDK (LiveKit REST). Accepts ws(s):// or https:// URLs. */
function httpUrl(url: string) {
  return url.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
}

// The SAME formula the token route uses — every participant, the moderator and Egress must
// target the identical room, so keep this the single source of truth.
export function roomNameForSession(sessionId: string) {
  return `rillcod-${sessionId.slice(0, 12)}`;
}

export function roomServiceClient() {
  const env = livekitEnv();
  if (!env) return null;
  return new RoomServiceClient(httpUrl(env.url), env.apiKey, env.apiSecret);
}

export function egressClient() {
  const env = livekitEnv();
  if (!env) return null;
  return new EgressClient(httpUrl(env.url), env.apiKey, env.apiSecret);
}

/** True when R2 (S3-compatible) credentials are present so Egress can upload there. */
export function r2EgressConfigured() {
  return !!(process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);
}

/** Deterministic R2 object key for a recording take. */
export function recordingR2Key(sessionId: string, stamp = Date.now()) {
  return `live-recordings/${sessionId}/${stamp}.mp4`;
}

/**
 * Self-healing finalise: reconcile any 'recording'/'processing' rows for a session against
 * LiveKit's egress state, so recordings still flip to 'ready' even if the webhook is not
 * configured (or was missed). Best-effort — never throws to the caller.
 * `admin` is a service-role Supabase client; pass it in to avoid a circular import.
 */
export async function reconcilePendingRecordings(admin: any, sessionId: string): Promise<void> {
  const eg = egressClient();
  if (!eg) return;
  try {
    const { data: pending } = await admin
      .from('session_recordings')
      .select('id, egress_id, status')
      .eq('session_id', sessionId)
      .in('status', ['recording', 'processing']);
    for (const row of pending ?? []) {
      if (!row.egress_id) continue;
      try {
        const list = await eg.listEgress({ egressId: row.egress_id });
        const info = Array.isArray(list) ? list[0] : (list as any)?.items?.[0];
        if (!info) continue;
        const done = info.status === EgressStatus.EGRESS_COMPLETE;
        const failed = info.status === EgressStatus.EGRESS_FAILED || info.status === EgressStatus.EGRESS_ABORTED;
        if (!done && !failed) continue;
        const file = Array.isArray(info.fileResults) && info.fileResults.length ? info.fileResults[0] : null;
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (failed) {
          patch.status = 'failed';
          patch.error = info.error || 'Egress failed';
        } else {
          patch.status = 'ready';
          patch.ended_at = new Date().toISOString();
          if (file?.filename) patch.r2_key = String(file.filename).replace(/^\/+/, '');
          if (file?.duration != null) patch.duration_seconds = Math.round(Number(file.duration) / 1e9) || null;
          if (file?.size != null) patch.size_bytes = Number(file.size) || null;
        }
        await admin.from('session_recordings').update(patch).eq('id', row.id);
      } catch { /* per-row best-effort */ }
    }
  } catch { /* best-effort */ }
}

/**
 * An MP4 file output that lands directly in Cloudflare R2 via its S3-compatible API.
 * R2 needs region:'auto', the account endpoint, and path-style addressing.
 */
export function r2FileOutput(r2Key: string) {
  return new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: r2Key,
    output: {
      case: 's3',
      value: new S3Upload({
        accessKey: process.env.R2_ACCESS_KEY_ID!,
        secret: process.env.R2_SECRET_ACCESS_KEY!,
        bucket: process.env.R2_BUCKET_NAME ?? 'rillcod-assests',
        endpoint: process.env.R2_ENDPOINT!,
        region: 'auto',
        forcePathStyle: true,
      }),
    },
  });
}
