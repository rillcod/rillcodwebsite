import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  const role = profile?.role;

  const url = new URL(req.url);
  const cursor = url.searchParams.get('cursor');
  const assignmentId = url.searchParams.get('assignment_id');
  const status = url.searchParams.get('status') ?? 'pending_review';

  let query = supabase
    .from('assignment_submissions')
    .select('*, portal_users!portal_user_id(full_name, email), assignments!assignment_id(title, grading_mode, max_points, class_id, created_by)')
    .eq('status', status)
    .order('submitted_at', { ascending: false })
    .limit(20);

  if (assignmentId) query = query.eq('assignment_id', assignmentId);
  if (cursor) query = query.lt('submitted_at', cursor);

  // Scope by role
  if (role === 'teacher') {
    query = query.eq('assignments.created_by', user.id);
  } else if (role === 'school') {
    // scoped by school via RLS
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const nextCursor = data && data.length === 20 ? data[data.length - 1].submitted_at : null;
  return NextResponse.json({ data, nextCursor });
}
