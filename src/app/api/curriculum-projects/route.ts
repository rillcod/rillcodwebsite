import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role, school_id')
    .eq('id', user.id)
    .single();
  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const programId = url.searchParams.get('program_id');
  const courseId = url.searchParams.get('course_id');
  const track = url.searchParams.get('track');
  const seedSource = url.searchParams.get('seed_source');

  let query = supabase
    .from('curriculum_project_registry')
    .select('*')
    .order('difficulty_level', { ascending: true })
    .order('created_at', { ascending: true });

  if (profile.role === 'school' && profile.school_id) {
    query = query.or(`school_id.eq.${profile.school_id},school_id.is.null`);
  }
  if (programId) query = query.eq('program_id', programId);
  if (courseId) query = query.eq('course_id', courseId);
  if (track) query = query.eq('track', track);
  if (seedSource) query = query.contains('metadata', { seed_source: seedSource });

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  if (!profile || profile.role !== 'school') {
    return NextResponse.json({ error: 'Only school role can create progression projects.' }, { status: 403 });
  }

  const body = await req.json();
  const {
    program_id,
    course_id = null,
    project_key,
    title,
    track,
    concept_tags = [],
    difficulty_level = 1,
    classwork_prompt = null,
    estimated_minutes = null,
    metadata = {},
  } = body;

  if (!program_id || !project_key || !title || !track) {
    return NextResponse.json({ error: 'program_id, project_key, title, and track are required.' }, { status: 400 });
  }

  const allowedTracks = new Set([
    'young_innovator',
    'scratch',
    'python',
    'html_css',
    'intro_ai_tools',
    'mixed',
    'jss_web_app',
    'jss_python',
    'ss_uiux_mobile',
  ]);
  if (!allowedTracks.has(track)) {
    return NextResponse.json({ error: 'Invalid track.' }, { status: 400 });
  }

  const { data: program } = await supabase
    .from('programs')
    .select('id, program_scope, school_progression_enabled')
    .eq('id', program_id)
    .single();
  if (!program) return NextResponse.json({ error: 'Program not found.' }, { status: 404 });
  if (program.program_scope !== 'regular_school' || program.school_progression_enabled !== true) {
    return NextResponse.json({ error: 'Program is not eligible for school progression registry.' }, { status: 422 });
  }

  const payload = {
    school_id: profile.school_id,
    program_id,
    course_id,
    project_key,
    title,
    track,
    concept_tags: Array.isArray(concept_tags) ? concept_tags : [],
    difficulty_level: Math.max(1, Math.min(10, Number(difficulty_level) || 1)),
    classwork_prompt,
    estimated_minutes: estimated_minutes ? Number(estimated_minutes) : null,
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
    created_by: user.id,
  };

  const { data, error } = await supabase
    .from('curriculum_project_registry')
    .insert(payload)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data }, { status: 201 });
}
