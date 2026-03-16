import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireStaff() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id, school_id, school_name')
    .eq('id', user.id)
    .single();
  if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) return null;
  return caller;
}

// GET /api/assignments — list assignments visible to current user
export async function GET(request: NextRequest) {
  try {
    const caller = await requireStaff();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

    const admin = adminClient();
    let query = admin
      .from('assignments')
      .select(`
        id, title, description, instructions, due_date, max_points,
        assignment_type, is_active, created_at, created_by,
        school_id, school_name,
        courses ( id, title, programs ( name ) ),
        assignment_submissions ( id, status, grade )
      `)
      .order('due_date', { ascending: true });

    if (caller.role === 'teacher') {
      query = query.eq('created_by', caller.id) as any;
    } else if (caller.role === 'school') {
      // school role: see assignments scoped to their school
      const filters: string[] = [];
      if (caller.school_id) filters.push(`school_id.eq.${caller.school_id}`);
      if (caller.school_name) filters.push(`school_name.eq.${caller.school_name}`);
      if (filters.length > 0) query = query.or(filters.join(',')) as any;
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// POST /api/assignments — create a new assignment (bypasses RLS)
export async function POST(request: NextRequest) {
  try {
    const caller = await requireStaff();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    if (caller.role === 'school') return NextResponse.json({ error: 'Not authorized to create assignments' }, { status: 403 });

    const body = await request.json();
    const allowed = ['title', 'description', 'instructions', 'course_id', 'due_date',
      'max_points', 'assignment_type', 'is_active', 'questions', 'school_id', 'school_name'];
    const payload: Record<string, unknown> = { created_by: caller.id };
    for (const f of allowed) {
      if (f in body) payload[f] = body[f] ?? null;
    }
    payload.created_at = new Date().toISOString();

    const { data, error } = await adminClient()
      .from('assignments')
      .insert(payload)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
