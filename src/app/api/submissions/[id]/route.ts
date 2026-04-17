import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireGrader() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await supabase
    .from('portal_users')
    .select('id, role')
    .eq('id', user.id)
    .single();
  if (!caller || !['admin', 'teacher'].includes(caller.role)) return null;
  return caller;
}

// PATCH /api/submissions/[id] — grade or update a submission (admin/teacher only)
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireGrader();
  if (!caller) return NextResponse.json({ error: 'Admin or Teacher access required' }, { status: 403 });

  const { id } = await context.params;
  const body = await request.json();

  // Whitelist allowed update fields
  const allowed: Record<string, any> = {};
  const fields = ['grade', 'feedback', 'status', 'submission_text', 'graded_by', 'graded_at'];
  fields.forEach(f => { if (f in body) allowed[f] = body[f]; });

  // Auto-set graded_at when status=graded and not explicitly provided
  if (body.status === 'graded' && !('graded_at' in body)) {
    allowed.graded_at = new Date().toISOString();
  }
  // Always stamp graded_by from caller
  if (body.status === 'graded' || 'grade' in body) {
    allowed.graded_by = caller.id;
  }

  const { data, error } = await adminClient()
    .from('assignment_submissions')
    .update(allowed)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// DELETE /api/submissions/[id] — delete a submission (admin/teacher only)
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const caller = await requireGrader();
  if (!caller) return NextResponse.json({ error: 'Admin or Teacher access required' }, { status: 403 });

  const { id } = await context.params;
  const { error } = await adminClient()
    .from('assignment_submissions')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
