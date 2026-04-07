import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireAuth() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id')
    .eq('id', user.id)
    .single();
  return caller ?? null;
}

// POST /api/assignments/[id]/grade
// Grades a submission or creates a graded submission if none exists.
// Body: { submission_id?, student_id?, grade, feedback?, status?, submission_text? }
// - If submission_id: update that submission
// - If student_id (no submission_id): upsert a new graded submission
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await requireAuth();
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['admin', 'teacher', 'school'].includes(caller.role)) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    const { id: assignment_id } = await params;
    const body = await request.json();
    const { submission_id, student_id, grade, feedback, status, submission_text } = body;

    const admin = adminClient();

    // Fetch assignment weight + max_points to compute weighted_score
    const { data: assignment } = await admin
      .from('assignments')
      .select('weight, max_points')
      .eq('id', assignment_id)
      .single();

    const assignWeight = assignment?.weight ?? 0;
    const assignMax = assignment?.max_points ?? 100;

    function computeWeightedScore(g: number | null | undefined): number | null {
      if (g == null || assignWeight === 0 || assignMax === 0) return null;
      return Math.round((g / assignMax) * assignWeight);
    }

    if (submission_id) {
      // Update existing submission
      const updatePayload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (grade !== undefined) updatePayload.grade = grade ?? null;
      if (feedback !== undefined) updatePayload.feedback = feedback ?? null;
      if (status !== undefined) updatePayload.status = status;
      if (submission_text !== undefined) updatePayload.submission_text = submission_text ?? null;
      if (status === 'graded' || grade !== undefined) {
        updatePayload.graded_by = caller.id;
        updatePayload.graded_at = new Date().toISOString();
        updatePayload.weighted_score = computeWeightedScore(grade);
      }

      const { data, error } = await admin
        .from('assignment_submissions')
        .update(updatePayload)
        .eq('id', submission_id)
        .select('id, grade, status, weighted_score')
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data });
    }

    if (student_id) {
      // Create or update submission for this student
      const { data, error } = await admin
        .from('assignment_submissions')
        .upsert({
          assignment_id,
          portal_user_id: student_id,
          grade: grade ?? null,
          feedback: feedback ?? null,
          status: status ?? 'graded',
          submission_text: submission_text ?? null,
          graded_by: caller.id,
          graded_at: new Date().toISOString(),
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          weighted_score: computeWeightedScore(grade),
        }, { onConflict: 'assignment_id,portal_user_id' })
        .select('id, grade, status, weighted_score')
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data });
    }

    return NextResponse.json({ error: 'submission_id or student_id required' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
