import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// PATCH /api/cbt/sessions/[id]
// Used by teachers/admins to save grades on a CBT session
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: caller } = await adminClient()
      .from('portal_users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!caller || !['admin', 'teacher'].includes(caller.role)) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    // Whitelist updatable fields for grading
    const allowed: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if ('score'         in body) allowed.score          = body.score;
    if ('status'        in body) allowed.status         = body.status;
    if ('manual_scores' in body) allowed.manual_scores  = body.manual_scores;
    if ('grading_notes' in body) allowed.grading_notes  = body.grading_notes;
    if ('needs_grading' in body) allowed.needs_grading  = body.needs_grading;

    const { data, error } = await adminClient()
      .from('cbt_sessions')
      .update(allowed)
      .eq('id', id)
      .select('id, score, status');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
