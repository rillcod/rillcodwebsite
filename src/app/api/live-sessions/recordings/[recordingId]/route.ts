import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireLiveSessionUser, canManageLiveSession } from '@/lib/live-sessions/authz';
import { r2Delete } from '@/lib/r2/client';
import { logAudit } from '@/lib/audit/log';
import type { Database } from '@/types/supabase';

export const dynamic = 'force-dynamic';

type RecordingUpdate = Database['public']['Tables']['session_recordings']['Update'];

// Load a recording + its session, and confirm the caller may manage it (host/admin/school).
async function loadManaged(recordingId: string) {
  const caller = await requireLiveSessionUser();
  if (!caller) return { error: 'Unauthorized', status: 401 as const };
  const admin = createAdminClient();
  const { data: rec } = await admin
    .from('session_recordings')
    .select('id, session_id, r2_key, live_sessions(id, host_id, school_id, program_id, status)')
    .eq('id', recordingId)
    .maybeSingle();
  if (!rec) return { error: 'Recording not found', status: 404 as const };
  const session = (rec as any).live_sessions;
  if (!session || !(await canManageLiveSession(admin as any, caller, session))) {
    return { error: 'Only the host can manage this recording.', status: 403 as const };
  }
  return { admin, caller, rec };
}

// PATCH — tie the recording to a lesson (like a lesson resource) and/or rename it.
// Body: { lessonId?: string | null, title?: string }
export async function PATCH(req: NextRequest, context: { params: Promise<{ recordingId: string }> }) {
  const { recordingId } = await context.params;
  const ctx = await loadManaged(recordingId);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const patch: RecordingUpdate = { updated_at: new Date().toISOString() };

  if ('lessonId' in body) {
    const lessonId = typeof body.lessonId === 'string' && body.lessonId ? body.lessonId : null;
    if (lessonId) {
      // The lesson must exist AND belong to the same programme as the session (integrity).
      const { data: lesson } = await ctx.admin.from('lessons').select('id').eq('id', lessonId).maybeSingle();
      if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
    }
    patch.lesson_id = lessonId;
  }
  if (typeof body.title === 'string') patch.title = body.title.trim() || null;

  const { error } = await ctx.admin.from('session_recordings').update(patch).eq('id', recordingId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE — remove the recording row AND its R2 object (host-only). Frees the paid storage.
export async function DELETE(_req: NextRequest, context: { params: Promise<{ recordingId: string }> }) {
  const { recordingId } = await context.params;
  const ctx = await loadManaged(recordingId);
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const key = (ctx.rec as any).r2_key as string | null;
  if (key) { try { await r2Delete(key); } catch { /* object may already be gone */ } }
  const { error } = await ctx.admin.from('session_recordings').delete().eq('id', recordingId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAudit(ctx.admin as any, {
    action: 'delete_recording',
    actorId: ctx.caller.id,
    resourceType: 'session_recording',
    resourceId: recordingId,
    oldValue: key ?? null,
  });
  return NextResponse.json({ ok: true, deleted: true });
}
