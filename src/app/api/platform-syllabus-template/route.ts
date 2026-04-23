import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

/**
 * Canonical QA syllabus week spine (see migration platform_syllabus_week_template).
 * Teachers/admins use this to align generated syllabi and lesson plans with a fixed pattern.
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role, school_id')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'teacher'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const programId = searchParams.get('program_id');
  const catalogVersion = searchParams.get('catalog_version')?.trim() || 'qa_spine_v1';
  const laneIndex = searchParams.get('lane_index');
  const gradeKey = searchParams.get('grade_key');
  const track = searchParams.get('track');

  let q = supabase
    .from('platform_syllabus_week_template')
    .select(
      'id, catalog_version, program_id, lane_index, track, grade_key, grade_label, syllabus_phase, year_number, term_number, week_number, week_index, topic, subtopics, metadata',
    )
    .eq('catalog_version', catalogVersion)
    .order('lane_index', { ascending: true })
    .order('week_index', { ascending: true });

  if (programId) q = q.eq('program_id', programId);
  if (laneIndex && /^\d+$/.test(laneIndex)) q = q.eq('lane_index', Number(laneIndex));
  if (gradeKey && /^[a-z0-9_]+$/i.test(gradeKey)) q = q.eq('grade_key', gradeKey.toLowerCase());
  if (track && /^[a-z0-9_]+$/i.test(track)) q = q.eq('track', track.toLowerCase());

  const { data: rows, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = rows ?? [];
  const byLane: Record<string, number> = {};
  for (const r of list as { lane_index?: number }[]) {
    const k = String(r.lane_index ?? '');
    byLane[k] = (byLane[k] ?? 0) + 1;
  }

  return NextResponse.json({
    data: {
      catalog_version: catalogVersion,
      total: list.length,
      weeks_per_lane: byLane,
      rows: list,
    },
  });
}
