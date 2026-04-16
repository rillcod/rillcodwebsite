import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { queueService } from '@/services/queue.service';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Caller = { role: string; id: string; school_id: string | null };

async function getCaller(): Promise<Caller | null> {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: caller } = await adminClient()
    .from('portal_users')
    .select('role, id, school_id')
    .eq('id', user.id)
    .single();
  return (caller as Caller) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/assignments/[id]/grade
// Grades a submission or creates a graded one if none exists yet.
// Body: { submission_id?, student_id?, grade, feedback?, status?, submission_text? }
// Teacher must be in the assignment's school or have created it.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const caller = await getCaller();
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['admin', 'teacher', 'school'].includes(caller.role)) {
      return NextResponse.json({ error: 'Staff access required' }, { status: 403 });
    }

    const { id: assignment_id } = await params;
    const admin = adminClient();

    // Fetch assignment to verify access + get weight/max_points
    const { data: assignment } = await admin
      .from('assignments')
      .select('weight, max_points, school_id, created_by')
      .eq('id', assignment_id)
      .maybeSingle();

    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

    // School boundary: teacher must own the assignment or be at its school
    if (caller.role === 'teacher') {
      const ownAssignment = assignment.created_by === caller.id;
      const sameSchool = assignment.school_id && caller.school_id === assignment.school_id;
      const inTeacherSchools = !ownAssignment && !sameSchool && assignment.school_id
        ? await (async () => {
            const { data: ts } = await admin
              .from('teacher_schools')
              .select('school_id')
              .eq('teacher_id', caller.id)
              .eq('school_id', assignment.school_id)
              .maybeSingle();
            return !!ts;
          })()
        : false;

      if (!ownAssignment && !sameSchool && !inTeacherSchools) {
        return NextResponse.json(
          { error: 'Access denied: assignment belongs to a school you are not assigned to' },
          { status: 403 },
        );
      }
    }
    if (caller.role === 'school' && assignment.school_id && assignment.school_id !== caller.school_id) {
      return NextResponse.json(
        { error: 'Access denied: assignment belongs to a different school' },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { submission_id, student_id, grade, feedback, status, submission_text } = body;

    const assignWeight = assignment.weight ?? 0;
    const assignMax    = assignment.max_points ?? 100;

    function computeWeightedScore(g: number | null | undefined): number | null {
      if (g == null || assignWeight === 0 || assignMax === 0) return null;
      return Math.round((g / assignMax) * assignWeight);
    }

    if (submission_id) {
      // Verify the submission belongs to this assignment (prevent cross-assignment grading)
      const { data: sub } = await admin
        .from('assignment_submissions')
        .select('id, assignment_id')
        .eq('id', submission_id)
        .eq('assignment_id', assignment_id)
        .maybeSingle();
      if (!sub) return NextResponse.json({ error: 'Submission not found on this assignment' }, { status: 404 });

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
        .select('id, grade, status, weighted_score, portal_user_id')
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      
      if (updatePayload.graded_by && data?.portal_user_id) {
          queueService.queueNotification(data.portal_user_id, 'whatsapp', {
              body: `Your assignment has been graded! You scored ${data.grade}. Check your Rillcod dashboard for feedback.`
          }).catch(console.error);
      }
      
      return NextResponse.json({ data });
    }

    if (student_id) {
      const { data, error } = await admin
        .from('assignment_submissions')
        .upsert({
          assignment_id,
          portal_user_id:  student_id,
          grade:           grade ?? null,
          feedback:        feedback ?? null,
          status:          status ?? 'graded',
          submission_text: submission_text ?? null,
          graded_by:       caller.id,
          graded_at:       new Date().toISOString(),
          submitted_at:    new Date().toISOString(),
          updated_at:      new Date().toISOString(),
          weighted_score:  computeWeightedScore(grade),
        }, { onConflict: 'assignment_id,portal_user_id' })
        .select('id, grade, status, weighted_score, portal_user_id')
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      if (data?.portal_user_id) {
          queueService.queueNotification(data.portal_user_id, 'whatsapp', {
              body: `Your assignment has been graded! You scored ${data.grade}. Check your Rillcod dashboard for feedback.`
          }).catch(console.error);
      }

      return NextResponse.json({ data });
    }

    return NextResponse.json({ error: 'submission_id or student_id required' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
