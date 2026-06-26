import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTeacherSchoolIds } from '@/lib/auth-utils';

async function allowedStudentIdsForStaff(profile: any, targetUserId?: string | null) {
  if (profile?.role === 'admin') return targetUserId ? [targetUserId] : null;
  if (profile?.role !== 'teacher') return [];
  const admin = createAdminClient();
  const schoolIds = await getTeacherSchoolIds(profile.id, profile.school_id ?? null);
  if (schoolIds.length === 0) return [];
  let q = admin.from('portal_users').select('id').eq('role', 'student').in('school_id', schoolIds);
  if (targetUserId) q = q.eq('id', targetUserId);
  const { data } = await q;
  return (data ?? []).map((row: any) => row.id);
}

// GET /api/lab/projects — list projects
export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const targetUserId = searchParams.get('userId');

  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();

  const isStaff = ['admin', 'teacher'].includes(profile?.role || '');

  let query = (supabase as any).from('lab_projects').select('*');

  if (targetUserId && isStaff) {
    if (profile?.role === 'teacher') {
      const allowedIds = await allowedStudentIdsForStaff(profile, targetUserId);
      if (!Array.isArray(allowedIds) || !allowedIds.includes(targetUserId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    query = query.eq('user_id', targetUserId);
  } else if (isStaff && profile?.role === 'teacher') {
    const allowedIds = await allowedStudentIdsForStaff(profile);
    if (allowedIds && allowedIds.length === 0) return NextResponse.json({ data: [] });
    if (allowedIds) query = query.in('user_id', allowedIds);
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
      .select('id, role, school_id')
      .eq('id', user.id)
      .single();
  
    const isStaff = ['admin', 'teacher'].includes(profile?.role || '');
    const userIdToSave = (isStaff && body.student_id) ? body.student_id : user.id;
    if (isStaff && profile?.role === 'teacher') {
      const allowedIds = await allowedStudentIdsForStaff(profile, userIdToSave);
      if (!Array.isArray(allowedIds) || !allowedIds.includes(userIdToSave)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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
