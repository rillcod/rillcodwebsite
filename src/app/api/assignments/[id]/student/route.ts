import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/assignments/[id]/student
// Returns the assignment + the calling user's own submission.
// Intended for students only. Correct answers are stripped from questions.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();

    // Fetch caller profile
    const { data: caller } = await admin
      .from('portal_users')
      .select('role, id, school_id')
      .eq('id', user.id)
      .single();

    if (!caller) return NextResponse.json({ error: 'User not found' }, { status: 403 });

    // This endpoint is for students only — staff use GET /api/assignments/[id]
    if (!['student', 'parent'].includes(caller.role)) {
      return NextResponse.json({ error: 'Use /api/assignments/[id] for staff access' }, { status: 403 });
    }

    const { id } = await params;

    const [asgnRes, subRes] = await Promise.all([
      admin
        .from('assignments')
        .select('id, title, description, instructions, due_date, max_points, assignment_type, is_active, created_at, questions, school_id, courses ( id, title, programs ( name ) )')
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

    const asgn = asgnRes.data as any;

    // Students can only see active assignments from their school
    if (!asgn.is_active) {
      return NextResponse.json({ error: 'This assignment is not currently active' }, { status: 403 });
    }
    if (asgn.school_id && asgn.school_id !== caller.school_id) {
      return NextResponse.json({ error: 'You do not have access to this assignment' }, { status: 403 });
    }

    // Strip correct_answer from questions so students can't cheat
    const safeQuestions = Array.isArray(asgn.questions)
      ? asgn.questions.map(({ correct_answer: _ca, ...q }: any) => q)
      : asgn.questions;

    const data = {
      ...asgn,
      questions: safeQuestions,
      assignment_submissions: subRes.data ? [subRes.data] : [],
    };

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
