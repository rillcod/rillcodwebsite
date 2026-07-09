import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  requireLiveSessionUser,
  canManageLiveSession,
} from '@/lib/live-sessions/authz';
import {
  egressClient,
  roomNameForSession,
  r2EgressConfigured,
  r2FileOutput,
  recordingR2Key,
  reconcilePendingRecordings,
} from '@/lib/live-sessions/livekit-server';

export const dynamic = 'force-dynamic';

async function loadSessionAsModerator(id: string) {
  const caller = await requireLiveSessionUser();
  if (!caller) return { error: 'Unauthorized', status: 401 as const };
  const admin = createAdminClient();
  const { data: session } = await admin
    .from('live_sessions')
    .select('id, host_id, school_id, program_id, title, status')
    .eq('id', id)
    .maybeSingle();
  if (!session) return { error: 'Session not found', status: 404 as const };
  const isModerator = await canManageLiveSession(admin as any, caller, session);
  if (!isModerator) return { error: 'Only the host can record this session.', status: 403 as const };
  return { admin, caller, session };
}

// GET — current recording state for this session (so the UI shows Start vs Stop).
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const ctx = await loadSessionAsModerator(id);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  await reconcilePendingRecordings(ctx.admin, id);
  const { data: activeRows } = await ctx.admin
    .from('session_recordings')
    .select('id, status, started_at, egress_id')
    .eq('session_id', id)
    .in('status', ['recording', 'processing'])
    .order('started_at', { ascending: false })
    .limit(1);
  const active = activeRows?.[0] ?? null;
  return NextResponse.json({ recording: !!active && active.status === 'recording', active });
}

// POST — { action: 'start' | 'stop' }. Records the whole room to Cloudflare R2 via LiveKit Egress.
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const ctx = await loadSessionAsModerator(id);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { admin, caller, session } = ctx;

  const eg = egressClient();
  if (!eg) return NextResponse.json({ error: 'Live recording is not configured on this server.' }, { status: 500 });
  if (!r2EgressConfigured()) {
    return NextResponse.json({ error: 'Cloud storage (R2) is not configured for recordings.' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = String(body.action ?? 'start');
  const lessonId = typeof body.lessonId === 'string' && body.lessonId ? body.lessonId : null;

  // Guard against duplicate takes — one active recording per session.
  const { data: existingRows } = await admin
    .from('session_recordings')
    .select('id, egress_id, status')
    .eq('session_id', id)
    .in('status', ['recording', 'processing'])
    .order('started_at', { ascending: false })
    .limit(1);
  const existing = existingRows?.[0] ?? null;

  if (action === 'start') {
    if (existing && existing.status === 'recording') {
      return NextResponse.json({ ok: true, alreadyRecording: true, recordingId: existing.id });
    }

    // A recording is ALWAYS filed under a course/programme (its learning-path home) — never
    // orphaned. Resolve it from the session, else from the tagged lesson's course.
    let programId: string | null = session.program_id ?? null;
    if (!programId && lessonId) {
      const { data: lesson } = await admin
        .from('lessons').select('course_id, courses(program_id)').eq('id', lessonId).maybeSingle();
      programId = (lesson as any)?.courses?.program_id ?? null;
    }
    if (!programId) {
      return NextResponse.json({
        error: 'This session is not attached to a course/programme, so its recording cannot be filed. Attach a programme to the session (or tag a lesson) before recording.',
      }, { status: 400 });
    }

    const room = roomNameForSession(id);
    const r2Key = recordingR2Key(id);
    try {
      const info = await eg.startRoomCompositeEgress(room, { file: r2FileOutput(r2Key) }, { layout: 'grid' });
      const { data: row, error } = await admin.from('session_recordings').insert({
        session_id: id,
        school_id: session.school_id ?? null,
        program_id: programId,
        class_id: null,
        lesson_id: lessonId,
        title: (session as any).title ?? null,
        egress_id: info.egressId,
        r2_key: r2Key,
        status: 'recording',
        started_by: caller.id,
      }).select('id').single();
      if (error) throw error;
      return NextResponse.json({ ok: true, recordingId: row.id, egressId: info.egressId });
    } catch (err: any) {
      return NextResponse.json({ error: err?.message ?? 'Could not start recording (is Egress enabled?)' }, { status: 502 });
    }
  }

  if (action === 'stop') {
    if (!existing?.egress_id) return NextResponse.json({ ok: true, notRecording: true });
    try {
      await eg.stopEgress(existing.egress_id);
    } catch { /* egress may have already ended — the webhook still finalises the row */ }
    await admin.from('session_recordings')
      .update({ status: 'processing', ended_at: new Date().toISOString() })
      .eq('id', existing.id);
    return NextResponse.json({ ok: true, recordingId: existing.id, processing: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
