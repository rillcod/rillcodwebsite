import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET /api/assignments/[id]/student
// Returns the assignment + the calling user's own submission.
// Called by students from the assignment detail page.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { id } = await params;

    const [asgnRes, subRes] = await Promise.all([
      admin
        .from('assignments')
        .select('id, title, description, instructions, due_date, max_points, assignment_type, is_active, created_at, questions, courses ( id, title, programs ( name ) )')
        .eq('id', id)
        .maybeSingle(),
      admin
        .from('assignment_submissions')
        .select('id, status, grade, feedback, submitted_at, graded_at, portal_user_id, submission_text, file_url, answers')
        .eq('assignment_id', id)
        .eq('portal_user_id', user.id)
        .maybeSingle(),
    ]);

    if (asgnRes.error) return NextResponse.json({ error: asgnRes.error.message }, { status: 500 });
    if (!asgnRes.data) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

    const data = { ...asgnRes.data, assignment_submissions: subRes.data ? [subRes.data] : [] };
    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
