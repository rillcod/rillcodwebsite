import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';

// PATCH /api/lab/projects/[id] — update project
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const body = await request.json();
  const { title, code, blocks_xml, is_public, lesson_id, assignment_id } = body;

  const update: any = {};
  if (title) update.title = title;
  if (code) update.code = code;
  if (blocks_xml) update.blocks_xml = blocks_xml;
  if (is_public !== undefined) update.is_public = is_public;
  if (lesson_id) update.lesson_id = lesson_id;
  if (assignment_id) update.assignment_id = assignment_id;
  update.updated_at = new Date().toISOString();

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role')
    .eq('id', user.id)
    .single();

  const isStaff = ['admin', 'teacher'].includes(profile?.role || '');

  let query = (supabase as any)
    .from('lab_projects')
    .update(update)
    .eq('id', id);
  
  if (!isStaff) {
    query = query.eq('user_id', user.id);
  }

  const { data, error } = await query.select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE /api/lab/projects/[id] — delete project
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role')
    .eq('id', user.id)
    .single();

  const isStaff = ['admin', 'teacher'].includes(profile?.role || '');

  let query = (supabase as any)
    .from('lab_projects')
    .delete()
    .eq('id', id);

  if (!isStaff) {
    query = query.eq('user_id', user.id);
  }

  const { error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
