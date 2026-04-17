import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  const url = new URL(req.url);
  const cursor = url.searchParams.get('cursor');
  const courseId = url.searchParams.get('course_id');

  let query = supabase
    .from('study_groups')
    .select('*, study_group_members(count)')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(20);

  if (profile?.school_id) query = query.eq('school_id', profile.school_id);
  if (courseId) query = query.eq('course_id', courseId);
  if (cursor) query = query.lt('created_at', cursor);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const nextCursor = data && data.length === 20 ? data[data.length - 1].created_at : null;
  return NextResponse.json({ data, nextCursor });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (profile?.role !== 'student') return NextResponse.json({ error: 'Only students can create study groups' }, { status: 403 });

  const { name, course_id } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required', field: 'name' }, { status: 400 });

  const { data, error } = await supabase
    .from('study_groups')
    .insert({ name: name.trim(), course_id: course_id || null, created_by: user.id, school_id: profile.school_id, status: 'active' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-join creator
  await supabase.from('study_group_members').insert({ group_id: data.id, user_id: user.id });

  return NextResponse.json({ data }, { status: 201 });
}
