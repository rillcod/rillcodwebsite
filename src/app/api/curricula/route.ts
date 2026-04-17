import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  const url = new URL(req.url);
  const courseId = url.searchParams.get('course_id');

  let query = supabase
    .from('course_curricula')
    .select('*, courses!course_id(title), portal_users!created_by(full_name)')
    .order('created_at', { ascending: false });

  if (profile?.school_id) query = query.eq('school_id', profile.school_id);
  if (courseId) query = query.eq('course_id', courseId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!profile || !['admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Only school admins can create curricula' }, { status: 403 });
  }

  const { course_id, course_name, grade_level, term_count, weeks_per_term, subject_area, notes } = await req.json();
  if (!course_id || !course_name) {
    return NextResponse.json({ error: 'course_id and course_name are required' }, { status: 400 });
  }

  // Call AI generation
  let aiContent: any = null;
  try {
    const aiRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: req.headers.get('cookie') ?? '' },
      body: JSON.stringify({
        type: 'curriculum',
        course_name,
        grade_level,
        term_count: term_count ?? 3,
        weeks_per_term: weeks_per_term ?? 12,
        subject_area,
        notes,
      }),
    });
    if (!aiRes.ok) throw new Error('AI generation failed');
    const aiJson = await aiRes.json();
    aiContent = aiJson.content ?? aiJson.data;
  } catch (err) {
    return NextResponse.json({ error: 'AI curriculum generation failed. Please try again.' }, { status: 502 });
  }

  if (!aiContent) {
    return NextResponse.json({ error: 'AI returned no content' }, { status: 502 });
  }

  // Check existing curriculum
  const { data: existing } = await (supabase as any)
    .from('course_curricula')
    .select('id, version')
    .eq('course_id', course_id)
    .eq('school_id', profile.school_id)
    .single();

  if (existing) {
    // Increment version
    const { data, error } = await supabase
      .from('course_curricula')
      .update({ content: aiContent, version: existing.version + 1, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  const { data, error } = await (supabase as any)
    .from('course_curricula')
    .insert({ course_id, school_id: profile.school_id, content: aiContent, version: 1, created_by: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
