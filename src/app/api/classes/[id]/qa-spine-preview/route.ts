import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { resolveQaSpineLane } from '@/lib/qa/resolveQaSpineLane';
import { calendarIndex, sourceWeekIndexForCalendar } from '@/lib/qa/rotatedSpineIndex';

/**
 * Preview rotated QA topics for a class (per school+class path) for one programme year.
 * GET /api/classes/[id]/qa-spine-preview?program_id=&year=1&lane_index=
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role, school_id')
    .eq('id', user.id)
    .single();
  if (!profile || !['admin', 'teacher'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: classId } = await context.params;
  const url = new URL(req.url);
  const programId = url.searchParams.get('program_id');
  const year = Math.min(3, Math.max(1, Number(url.searchParams.get('year') ?? '1')));
  const manualLane = Number(url.searchParams.get('lane_index') ?? '0');
  const catalog = url.searchParams.get('catalog_version')?.trim() || 'qa_spine_v1';

  const { data: cls, error: cErr } = await supabase
    .from('classes')
    .select('id, school_id, name, program_id, qa_spine_lane, qa_grade_key, qa_track_hint')
    .eq('id', classId)
    .single();
  if (cErr || !cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  if (profile.role === 'teacher' && cls.school_id && profile.school_id && cls.school_id !== profile.school_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const effectiveProgram = programId || cls.program_id;
  if (!effectiveProgram || typeof effectiveProgram !== 'string') {
    return NextResponse.json({ error: 'program_id query or class.program_id is required' }, { status: 400 });
  }

  const resolved = manualLane > 0 && manualLane <= 11
    ? { lane: manualLane, source: 'query' as const }
    : resolveQaSpineLane(cls);
  const lane = resolved.lane;
  const classSchoolId = cls.school_id;
  if (!classSchoolId) {
    return NextResponse.json(
      { error: 'Class is missing school binding' },
      { status: 422 },
    );
  }

  const { data: off, error: rpcErr } = await supabase.rpc('class_qa_path_offset', {
    p_school_id: classSchoolId,
    p_class_id: classId,
  });
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  const pathOffset = typeof off === 'number' ? off : 0;

  const { data: templateRows, error: trErr } = await supabase
    .from('platform_syllabus_week_template')
    .select('week_index, topic, subtopics')
    .eq('catalog_version', catalog)
    .eq('lane_index', lane)
    .eq('program_id', effectiveProgram)
    .order('week_index', { ascending: true });
  if (trErr) return NextResponse.json({ error: trErr.message }, { status: 500 });
  const rows = templateRows ?? [];
  if (rows.length === 0) {
    return NextResponse.json(
      {
        error: 'No spine rows for this programme/lane.',
        hint: 'Seed platform_syllabus_week_template rows for this class programme and lane.',
        program_id: effectiveProgram,
        lane_index: lane,
      },
      { status: 422 },
    );
  }

  const bySp = new Map(rows.map((r) => [r.week_index, r]));

  const terms: Array<{ term: number; weeks: { week: number; calendar_index: number; spine_week: number; topic: string }[] }> = [];
  for (let t = 1; t <= 3; t++) {
    const weeks = [];
    for (let w = 1; w <= 12; w++) {
      const cal = calendarIndex(year, t, w);
      const src = sourceWeekIndexForCalendar(cal, pathOffset, lane);
      const r = bySp.get(src) as { topic: string } | undefined;
      weeks.push({
        week: w,
        calendar_index: cal,
        spine_week: src,
        topic: r?.topic ?? '(missing row)',
      });
    }
    terms.push({ term: t, weeks });
  }

  return NextResponse.json({
    data: {
      class_id: classId,
      class_name: cls.name,
      program_id: effectiveProgram,
      year,
      catalog_version: catalog,
      lane_index: lane,
      lane_source: resolved.source,
      path_offset: pathOffset,
      terms,
    },
  });
}
