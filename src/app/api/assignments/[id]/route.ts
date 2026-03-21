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
    .select('role, id')
    .eq('id', user.id)
    .single();
  if (!caller || !['admin', 'teacher', 'school'].includes(caller.role)) return null;
  return caller;
}

// GET /api/assignments/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

  const { id } = await params;
  const { data, error } = await adminClient()
    .from('assignments')
    .select(`
      *, courses ( id, title, programs ( name ) ),
      assignment_submissions (
        id, status, grade, portal_user_id,
        submission_text, answers, file_url,
        submitted_at, graded_at, feedback,
        portal_users!assignment_submissions_portal_user_id_fkey ( full_name, email )
      )
    `)
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  return NextResponse.json({ data });
}

// PATCH /api/assignments/[id] — update assignment
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  if (caller.role === 'school') return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const { id } = await params;

  // Teachers can only edit their own assignments
  if (caller.role === 'teacher') {
    const { data: existing } = await adminClient().from('assignments').select('created_by').eq('id', id).single();
    if (!existing) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    if (existing.created_by !== caller.id) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const body = await request.json();

  const allowed: Record<string, unknown> = {};
  const allowedFields = ['title', 'description', 'instructions', 'course_id', 'due_date',
    'max_points', 'assignment_type', 'is_active', 'questions'];
  for (const f of allowedFields) {
    if (f in body) allowed[f] = body[f] ?? null;
  }
  allowed.updated_at = new Date().toISOString();

  const { error } = await adminClient()
    .from('assignments')
    .update(allowed)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// PUT /api/assignments/[id] — alias for PATCH
export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return PATCH(request, ctx);
}

// DELETE /api/assignments/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const caller = await requireStaff();
  if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
  if (caller.role === 'school') return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

  const { id } = await params;

  // Teachers can only delete their own assignments
  if (caller.role === 'teacher') {
    const { data: existing } = await adminClient().from('assignments').select('created_by').eq('id', id).single();
    if (!existing) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    if (existing.created_by !== caller.id) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const { error } = await adminClient()
    .from('assignments')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
