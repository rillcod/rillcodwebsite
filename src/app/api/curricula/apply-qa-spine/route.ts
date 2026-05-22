import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { SyllabusWeekDraft } from '@/lib/catalog/platformSpineToSyllabusWeeks';
import { resolveQaSpineLane } from '@/lib/qa/resolveQaSpineLane';
import { calendarIndex, sourceWeekIndexForCalendar } from '@/lib/qa/rotatedSpineIndex';
import type { Json } from '@/types/supabase';

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

type CurriculumContent = {
  course_title?: string;
  overview?: string;
  learning_outcomes?: string[];
  terms?: Array<{
    term: number;
    title?: string;
    objectives?: string[];
    weeks?: unknown[];
  }>;
};

function toSubtopics(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return [];
}

export async function POST(req: NextRequest) {
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

  const bodyRaw = await req.json().catch(() => ({} as unknown));
  const body = asObject(bodyRaw);
  const curriculumId = typeof body.curriculum_id === 'string' ? body.curriculum_id : '';
  const classId = typeof body.class_id === 'string' ? body.class_id : '';
  const yearNumber = Math.min(3, Math.max(1, Number(body.year_number ?? 1)));
  // program_start_term: which national term is Programme Term 1 for this school
  // e.g. 3 = school started coding in May (Third Term), so national T3 = Prog T1
  const bodyProgramStartTerm = [1, 2, 3].includes(Number(body.program_start_term))
    ? Number(body.program_start_term) : 0; // 0 = auto-detect from program policy
  const manualLane = Number(body.lane_index ?? 0);
  const catalogVersion =
    typeof body.catalog_version === 'string' && body.catalog_version.trim()
      ? body.catalog_version.trim()
      : 'qa_spine_v1';
  const overwriteExisting = body.overwrite_existing === true;

  if (!curriculumId) {
    return NextResponse.json({ error: 'curriculum_id is required' }, { status: 400 });
  }

  const { data: curriculum, error: currErr } = await supabase
    .from('course_curricula')
    .select('id, course_id, school_id, content, version, courses(program_id, title)')
    .eq('id', curriculumId)
    .single();
  if (currErr || !curriculum) {
    return NextResponse.json({ error: 'Curriculum not found' }, { status: 404 });
  }
  if (profile.role === 'teacher' && profile.school_id && curriculum.school_id && curriculum.school_id !== profile.school_id) {
    return NextResponse.json({ error: 'You can only apply QA spine to your school curriculum.' }, { status: 403 });
  }

  const programId = (curriculum as unknown as { courses?: { program_id?: string | null } | null }).courses?.program_id ?? null;

  let classRow: {
    id: string;
    school_id: string | null;
    qa_spine_lane: number | null;
    qa_grade_key: string | null;
    qa_track_hint: string | null;
    name: string | null;
  } | null = null;
  if (classId) {
    const { data: cl, error: clErr } = await supabase
      .from('classes')
      .select('id, school_id, qa_spine_lane, qa_grade_key, qa_track_hint, name')
      .eq('id', classId)
      .single();
    if (clErr || !cl) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    }
    classRow = {
      id: cl.id,
      school_id: cl.school_id,
      qa_spine_lane: cl.qa_spine_lane,
      qa_grade_key: cl.qa_grade_key,
      qa_track_hint: cl.qa_track_hint,
      name: cl.name,
    };
    if (profile.role === 'teacher' && classRow.school_id && classRow.school_id !== profile.school_id) {
      return NextResponse.json({ error: 'Class is not in your school scope.' }, { status: 403 });
    }
  }

  const resolved =
    manualLane > 0 && manualLane <= 11
      ? { lane: manualLane, source: 'body' as const }
      : classRow
        ? resolveQaSpineLane(classRow)
        : { lane: 1, source: 'default' as const };

  const chosenLane = resolved.lane;

  let pathOffset = 0;
  if (classRow) {
    const classSchoolId = classRow.school_id;
    if (!classSchoolId) {
      return NextResponse.json(
        { error: 'Class is missing school binding' },
        { status: 422 },
      );
    }
    const { data: off, error: rpcErr } = await supabase.rpc('class_qa_path_offset', {
      p_school_id: classSchoolId,
      p_class_id: classRow.id,
    });
    if (rpcErr) {
      return NextResponse.json({ error: rpcErr.message, hint: 'Run migration: class_qa_path_offset' }, { status: 500 });
    }
    pathOffset = typeof off === 'number' ? off : 0;
  }

  // Try with specific program_id first; fall back to any rows for this lane
  let rows: Array<{ week_index: number; topic: string; subtopics: unknown }> = [];
  if (programId) {
    const { data: programRows, error: trErr } = await supabase
      .from('platform_syllabus_week_template')
      .select('week_index, year_number, term_number, week_number, topic, subtopics, program_id')
      .eq('catalog_version', catalogVersion)
      .eq('lane_index', chosenLane)
      .eq('program_id', programId)
      .order('week_index', { ascending: true });
    if (trErr) return NextResponse.json({ error: trErr.message }, { status: 500 });
    rows = (programRows ?? []) as typeof rows;
  }
  if (rows.length === 0) {
    const { data: fallbackRows, error: fbErr } = await supabase
      .from('platform_syllabus_week_template')
      .select('week_index, year_number, term_number, week_number, topic, subtopics, program_id')
      .eq('catalog_version', catalogVersion)
      .eq('lane_index', chosenLane)
      .order('week_index', { ascending: true })
      .limit(108);
    if (fbErr) return NextResponse.json({ error: fbErr.message }, { status: 500 });
    rows = (fallbackRows ?? []) as typeof rows;
  }
  if (rows.length === 0) {
    return NextResponse.json(
      {
        error: 'No QA template rows for this lane.',
        hint: 'Run the QA spine migration to seed platform_syllabus_week_template.',
        lane_index: chosenLane,
      },
      { status: 422 },
    );
  }

  // Resolve program_start_term: body override → program policy → default 1
  let programStartTerm = bodyProgramStartTerm;
  if (!programStartTerm && programId) {
    const { data: prog } = await supabase
      .from('programs')
      .select('progression_policy')
      .eq('id', programId)
      .maybeSingle();
    const saved = (prog?.progression_policy as Record<string, unknown> | null)?.program_start_term;
    programStartTerm = [1, 2, 3].includes(Number(saved)) ? Number(saved) : 1;
  }
  if (!programStartTerm) programStartTerm = 1;

  // Map national term number → programme-internal term number
  // e.g. programStartTerm=3: national Term3→Prog1, Term1→Prog2, Term2→Prog3
  function nationalToProgTerm(nationalTerm: number): number {
    return ((nationalTerm - programStartTerm + 3) % 3) + 1;
  }

  const bySpine = new Map(rows.map((r) => [r.week_index, r]));

  // buildTermWeeks uses the PROGRAMME term number (1/2/3) for spine index
  function buildTermWeeks(progTermNo: number): SyllabusWeekDraft[] {
    const out: SyllabusWeekDraft[] = [];
    for (let w = 1; w <= 12; w++) {
      const cal = calendarIndex(yearNumber, progTermNo, w);
      const src = sourceWeekIndexForCalendar(cal, pathOffset, chosenLane);
      const row = bySpine.get(src);
      const topic = row?.topic ?? `Week ${w} (missing spine row ${src})`;
      out.push({
        week: w,
        type: 'lesson',
        topic,
        subtopics: toSubtopics(row?.subtopics),
        lesson_plan: null,
      });
    }
    return out;
  }

  const content = asObject((curriculum as { content?: unknown }).content) as CurriculumContent;
  const baseTerms = Array.isArray(content.terms) ? content.terms : [];

  // Build weeks for each national term using the correct programme-term position
  const nextTerms = [1, 2, 3].map((nationalTermNo) => {
    const progTermNo = nationalToProgTerm(nationalTermNo);
    const incoming = buildTermWeeks(progTermNo);
    const existing = baseTerms.find((t) => Number(t?.term ?? 0) === nationalTermNo) ?? { term: nationalTermNo };
    const existingWeeks = Array.isArray(existing.weeks) ? existing.weeks : [];
    return {
      ...existing,
      term: nationalTermNo,
      weeks: overwriteExisting ? incoming : existingWeeks.length > 0 ? existingWeeks : incoming,
    };
  });

  const nextContent: CurriculumContent = {
    ...content,
    terms: nextTerms,
  };

  const metadata = asObject((nextContent as Record<string, unknown>).metadata);
  (nextContent as Record<string, unknown>).metadata = {
    ...metadata,
    qa_spine: {
      applied_at: new Date().toISOString(),
      applied_by: user.id,
      catalog_version: catalogVersion,
      program_year: yearNumber,
      program_start_term: programStartTerm,
      lane_index: chosenLane,
      lane_source: manualLane > 0 ? 'body' : classId ? resolved.source : 'default',
      class_id: classId || null,
      path_offset: classRow ? pathOffset : 0,
      rotation: !!classId,
      overwrite_existing: overwriteExisting,
    },
  };

  const { data: updated, error: updErr } = await supabase
    .from('course_curricula')
    .update({
      content: nextContent as unknown as Json,
      version: Number((curriculum as { version?: number }).version ?? 1) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', curriculumId)
    .select('id, version, course_id, school_id')
    .single();
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({
    data: {
      curriculum: updated,
      qa_spine: {
        catalog_version: catalogVersion,
        program_id: programId,
        program_year: yearNumber,
        lane_index: chosenLane,
        class_id: classId || null,
        path_offset: classRow ? pathOffset : 0,
        terms_weeks: nextTerms.reduce((acc, t) => ({ ...acc, [`term_${t.term}`]: t.weeks.length }), {} as Record<string, number>),
        explicit_topics: true,
      },
    },
  });
}
