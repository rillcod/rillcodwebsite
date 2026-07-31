import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

function adminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export const dynamic = 'force-dynamic';

// GET /api/parent-teacher/threads
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role').eq('id', user.id).single();
  const role = profile?.role;
  if (!['parent', 'teacher', 'admin', 'school'].includes(role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let query = supabase
    .from('parent_teacher_threads')
    // Three embeds of the same table need three names, or PostgREST aliases them all to
    // parent_teacher_threads_portal_users_1 and rejects the query with 42712 ("specified more
    // than once") — which made this endpoint 500 every time.
    // The alias names are not free: dashboard/messages already reads portal_users_parent,
    // portal_users_teacher and portal_users_student, so they must match exactly or the page
    // silently falls back to "Teacher"/"Parent"/"Student" for every row.
    .select('*, portal_users_parent:portal_users!parent_teacher_threads_parent_id_fkey(full_name, avatar_url), portal_users_teacher:portal_users!parent_teacher_threads_teacher_id_fkey(full_name), portal_users_student:portal_users!parent_teacher_threads_student_id_fkey(full_name)')
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

  const { data: profile } = await supabase.from('portal_users').select('id, role').eq('id', user.id).single();
  if (!profile || !['parent', 'teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Body: parent initiates with teacher_id + student_id
  //       staff initiates with parent_id + teacher_id + student_id
  const body = await req.json();
  const { teacher_id, student_id } = body;
  const parent_id = profile.role === 'parent' ? user.id : (body.parent_id ?? null);

  if (!teacher_id || !student_id) {
    return NextResponse.json({ error: 'teacher_id and student_id are required' }, { status: 400 });
  }
  if (!parent_id) {
    return NextResponse.json({ error: 'parent_id required when staff initiates thread' }, { status: 400 });
  }

  // Check existing thread
  const q = supabase.from('parent_teacher_threads').select('*')
    .eq('teacher_id', teacher_id).eq('student_id', student_id);
  const { data: existing } = await (parent_id ? q.eq('parent_id', parent_id) : q).maybeSingle();

  if (existing) return NextResponse.json({ data: existing });

  const { data, error } = await supabase
    .from('parent_teacher_threads')
    .insert({ parent_id, teacher_id, student_id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

// DELETE /api/parent-teacher/threads?id=<thread_id>
// Staff (teacher/admin/school) or the parent in the thread can delete.
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('id, role').eq('id', user.id).single();
  if (!profile || !['parent', 'teacher', 'admin', 'school'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: thread } = await supabase
    .from('parent_teacher_threads')
    .select('id, parent_id, teacher_id')
    .eq('id', id)
    .single();
  if (!thread) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Only participants or admin can delete
  const isParticipant = thread.parent_id === user.id || thread.teacher_id === user.id;
  if (profile.role !== 'admin' && !isParticipant && profile.role !== 'school') {
    return NextResponse.json({ error: 'Only thread participants or admin can delete' }, { status: 403 });
  }

  // Use service-role client so RLS doesn't block the delete
  const db = adminDb();
  await db.from('parent_teacher_messages').delete().eq('thread_id', id);
  const { error } = await db.from('parent_teacher_threads').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
