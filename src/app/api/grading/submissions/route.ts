import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  const role = profile?.role;
  if (!['admin', 'teacher', 'school'].includes(String(role))) {
    return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  }
  if (role === 'school' && !profile?.school_id) {
    return NextResponse.json({ error: 'School account is missing school scope' }, { status: 403 });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get('cursor');
  const assignmentId = url.searchParams.get('assignment_id');
  const status = url.searchParams.get('status') ?? 'pending_review';
  const termIdParam = url.searchParams.get('term_id');
  const allSessions = url.searchParams.get('all_sessions') === '1';

  let query = supabase
    .from('assignment_submissions')
    .select('*, portal_users!portal_user_id(full_name, email), assignments!assignment_id(title, grading_mode, max_points, class_id, created_by, term_id)')
    .eq('status', status)
    .order('submitted_at', { ascending: false })
    .limit(40);

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

  let rows = data ?? [];
  if (!allSessions) {
    const { resolveAssignmentTermId } = await import('@/lib/assignments/session');
    const termId = termIdParam || await resolveAssignmentTermId(supabase as any, {});
    if (termId) {
      const liveId = await resolveAssignmentTermId(supabase as any, {});
      rows = rows.filter((row: any) => {
        const asnTerm = row.assignments?.term_id ?? null;
        if (asnTerm === termId) return true;
        // Legacy untagged only appear inside the live session.
        return !asnTerm && termId === liveId;
      });
    }
  }
  rows = rows.slice(0, 20);

  const nextCursor = rows.length === 20 ? rows[rows.length - 1].submitted_at : null;
  return NextResponse.json({ data: rows, nextCursor });
}
