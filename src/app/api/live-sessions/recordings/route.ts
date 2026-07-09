import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient as adminClient } from '@/lib/supabase/admin';
import {
  requireLiveSessionUser as requireAuth,
  canAccessLiveSession,
  getStudentProgramIds,
} from '@/lib/live-sessions/authz';
import { r2SignedUrl } from '@/lib/r2/client';

export const dynamic = 'force-dynamic';

// GET /api/live-sessions/recordings
// The student "Class Replays" library — every finished recording the caller may watch,
// scoped exactly like the live-sessions list (school broadcast / their school / their
// programmes). Each returns a short-lived signed R2 URL. Part of the learning path.
export async function GET(_req: NextRequest) {
  const caller = await requireAuth();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (caller.role === 'parent') return NextResponse.json({ recordings: [] });

  const admin = adminClient();
  let query = admin
    .from('session_recordings')
    .select('id, session_id, title, status, duration_seconds, size_bytes, r2_key, started_at, ended_at, school_id, program_id, live_sessions(id, title, scheduled_at, host_id, school_id, program_id, program:programs(name))')
    .eq('status', 'ready')
    .order('started_at', { ascending: false })
    .limit(200);

  // Candidate scoping (widen the set; canAccessLiveSession still gates each row below).
  if (caller.role === 'student') {
    const filters = ['school_id.is.null'];
    if (caller.school_id) filters.push(`school_id.eq.${caller.school_id}`);
    const programIds = await getStudentProgramIds(admin as any, caller.id);
    if (programIds.length > 0) filters.push(`program_id.in.(${programIds.join(',')})`);
    query = query.or(filters.join(','));
  } else if (caller.role === 'school') {
    if (!caller.school_id) return NextResponse.json({ recordings: [] });
    query = query.eq('school_id', caller.school_id);
  } else if (caller.role === 'teacher') {
    // LMS isolation: a teacher sees ONLY recordings of the live sessions they host —
    // never another teacher's, even within the same school.
    const { data: mySessions } = await admin.from('live_sessions').select('id').eq('host_id', caller.id);
    const ids = (mySessions ?? []).map((s: any) => s.id);
    if (ids.length === 0) return NextResponse.json({ recordings: [] });
    query = query.in('session_id', ids);
  } // admin: no filter

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const out = [];
  for (const rec of data ?? []) {
    const session = (rec as any).live_sessions;
    // Belt-and-suspenders: verify per-session access (never over-serve on the OR filter).
    if (caller.role !== 'admin' && session && !(await canAccessLiveSession(admin as any, caller, session))) continue;
    out.push({
      id: rec.id,
      session_id: rec.session_id,
      title: rec.title || session?.title || 'Class Recording',
      program_name: session?.program?.name ?? null,
      session_date: session?.scheduled_at ?? rec.started_at,
      duration_seconds: rec.duration_seconds,
      size_bytes: rec.size_bytes,
      started_at: rec.started_at,
      playback_url: rec.r2_key ? await r2SignedUrl(rec.r2_key, 6 * 3600) : null,
    });
  }

  return NextResponse.json({ recordings: out });
}
