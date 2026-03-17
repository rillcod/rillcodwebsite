import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

// GET /api/lab/projects — list projects
export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const targetUserId = searchParams.get('userId');

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role')
    .eq('id', user.id)
    .single();

  const isStaff = ['admin', 'teacher'].includes(profile?.role || '');

  let query = (supabase as any).from('lab_projects').select('*');

  if (targetUserId && isStaff) {
    query = query.eq('user_id', targetUserId);
  } else if (!isStaff) {
    query = query.eq('user_id', user.id);
  }

  const { data, error } = await query.order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST /api/lab/projects — create project
export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { title, language, code, blocks_xml, lesson_id, assignment_id } = body;

    const { data: profile } = await supabase
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .single();
  
    const isStaff = ['admin', 'teacher'].includes(profile?.role || '');
    const userIdToSave = (isStaff && body.student_id) ? body.student_id : user.id;

    const { data, error } = await (supabase as any)
    .from('lab_projects')
    .insert({
      user_id: userIdToSave,
      title: title || 'Untitled Project',
      language,
      code,
      blocks_xml,
      lesson_id,
      assignment_id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
