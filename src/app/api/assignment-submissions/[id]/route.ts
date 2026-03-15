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

// PATCH /api/assignment-submissions/[id]
// Update grade, feedback, status, submission_text on a submission
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await requireStaff();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });

    const { id } = await params;
    const body = await request.json();

    const allowed: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ('grade'           in body) allowed.grade           = body.grade ?? null;
    if ('feedback'        in body) allowed.feedback        = body.feedback ?? null;
    if ('status'          in body) allowed.status          = body.status;
    if ('submission_text' in body) allowed.submission_text = body.submission_text ?? null;
    if ('graded_by'       in body) allowed.graded_by       = body.graded_by;

    if (body.status === 'graded' || 'grade' in body) {
      allowed.graded_by = allowed.graded_by ?? caller.id;
      allowed.graded_at = new Date().toISOString();
    }
    if ('graded_at' in body) allowed.graded_at = body.graded_at;

    const { data, error } = await adminClient()
      .from('assignment_submissions')
      .update(allowed)
      .eq('id', id)
      .select('id, grade, status')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// DELETE /api/assignment-submissions/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await requireStaff();
    if (!caller) return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    if (caller.role === 'school') return NextResponse.json({ error: 'Not authorized' }, { status: 403 });

    const { id } = await params;
    const { error } = await adminClient()
      .from('assignment_submissions')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
