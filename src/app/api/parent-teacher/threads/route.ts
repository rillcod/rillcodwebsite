import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/parent-teacher/threads
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
  const role = profile?.role;

  let query = supabase
    .from('parent_teacher_threads')
    .select('*, portal_users!parent_id(full_name, avatar_url), portal_users!teacher_id(full_name), portal_users!student_id(full_name)')
    .order('created_at', { ascending: false });

  if (role === 'parent') query = query.eq('parent_id', user.id);
  else if (role === 'teacher') query = query.eq('teacher_id', user.id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST /api/parent-teacher/threads — initiate or get existing thread
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'parent') return NextResponse.json({ error: 'Only parents can initiate threads' }, { status: 403 });

  const { teacher_id, student_id } = await req.json();
  if (!teacher_id || !student_id) return NextResponse.json({ error: 'teacher_id and student_id are required' }, { status: 400 });

  // Check existing thread
  const { data: existing } = await supabase
    .from('parent_teacher_threads')
    .select('*')
    .eq('parent_id', user.id)
    .eq('teacher_id', teacher_id)
    .eq('student_id', student_id)
    .single();

  if (existing) return NextResponse.json({ data: existing });

  const { data, error } = await supabase
    .from('parent_teacher_threads')
    .insert({ parent_id: user.id, teacher_id, student_id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
