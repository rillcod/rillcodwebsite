import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds } from '@/lib/auth-utils';

async function teacherCanManageProject(teacherId: string, teacherSchoolId: string | null, projectId: string) {
  const admin = createAdminClient();
  const { data: project } = await admin.from('lab_projects').select('user_id').eq('id', projectId).maybeSingle();
  if (!project?.user_id) return false;
  const schoolIds = await getTeacherSchoolIds(teacherId, teacherSchoolId);
  if (schoolIds.length === 0) return false;
  const { data: student } = await admin
    .from('portal_users')
    .select('id')
    .eq('id', project.user_id)
    .eq('role', 'student')
    .in('school_id', schoolIds)
    .maybeSingle();
  return !!student;
}

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
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();

  const isStaff = ['admin', 'teacher'].includes(profile?.role || '');
  if (profile?.role === 'teacher') {
    const allowed = await teacherCanManageProject(profile.id, profile.school_id ?? null, id);
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();

  const isStaff = ['admin', 'teacher'].includes(profile?.role || '');
  if (profile?.role === 'teacher') {
    const allowed = await teacherCanManageProject(profile.id, profile.school_id ?? null, id);
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
