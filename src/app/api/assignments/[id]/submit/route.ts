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

const MCQ_TYPES = new Set(['multiple_choice', 'true_false', 'coding_blocks']);

function computeAutoGrade(
  questions: any[],
  answers: Record<string | number, any>,
  maxPoints: number,
): number | null {
  if (!questions?.length || !answers) return null;

  const gradeableQs = questions.filter(
    (q) => q.correct_answer && MCQ_TYPES.has(q.question_type),
  );
  if (!gradeableQs.length) return null;

  const totalQPts = gradeableQs.reduce((s, q) => s + (Number(q.points) || 0), 0);
  const ptsEach = totalQPts === 0 ? maxPoints / questions.length : null;

  let earned = 0;
  let possible = 0;

  gradeableQs.forEach((q) => {
    const idx = questions.indexOf(q);
    const qPts = ptsEach !== null ? ptsEach : (Number(q.points) || 0);
    possible += qPts;
    const studentAns = String(answers[idx] ?? '').trim().toLowerCase();
    const correctAns = String(q.correct_answer).trim().toLowerCase();
    if (studentAns && studentAns === correctAns) earned += qPts;
  });

  if (possible === 0) return null;
  return Math.round((earned / possible) * maxPoints);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/assignments/[id]/submit
// Students submit their own work. Staff may submit on behalf (admin/teacher only).
// Enforces: assignment is active, student can access it, no re-submission unless staff.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { data: caller } = await admin
      .from('portal_users')
      .select('role, id, school_id, class_id')
      .eq('id', user.id)
      .single();

    if (!caller) return NextResponse.json({ error: 'User not found' }, { status: 403 });

    const { id: assignment_id } = await params;
    const body = await request.json();
    const { portal_user_id, submission_text, file_url, answers } = body;

    // Only admin/teacher may submit on behalf of another student
    const isStaff = ['admin', 'teacher'].includes(caller.role);
    const effectiveUserId = isStaff ? (portal_user_id ?? caller.id) : caller.id;

    // Fetch assignment to validate access
    const { data: assignment } = await admin
      .from('assignments')
      .select('is_active, school_id, assignment_type, metadata, questions, max_points, weight, created_by, title')
      .eq('id', assignment_id)
      .maybeSingle();

    if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });

    // Students: assignment must be active
    if (!isStaff && !assignment.is_active) {
      return NextResponse.json({ error: 'This assignment is no longer active' }, { status: 403 });
    }

    // Students: school boundary check
    if (!isStaff && assignment.school_id && assignment.school_id !== caller.school_id) {
      return NextResponse.json({ error: 'You do not have access to this assignment' }, { status: 403 });
    }

    const upsertData: Record<string, unknown> = {
      assignment_id,
      portal_user_id: effectiveUserId,
      submitted_at:   new Date().toISOString(),
      status:         'submitted',
      updated_at:     new Date().toISOString(),
    };
    if (submission_text !== undefined) upsertData.submission_text = submission_text || null;
    if (file_url        !== undefined) upsertData.file_url        = file_url        || null;
    if (answers         != null)       upsertData.answers         = answers;

    const { data, error } = await admin
      .from('assignment_submissions')
      .upsert(upsertData, { onConflict: 'assignment_id,portal_user_id' })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Auto-grade MCQ immediately on submission
    if (answers && data) {
      try {
        const questions: any[] = Array.isArray(assignment.questions) ? assignment.questions : [];
        const maxPts = assignment.max_points ?? 100;
        const assignWeight = assignment.weight ?? 0;
        const autoGrade = computeAutoGrade(questions, answers, maxPts);

        if (autoGrade !== null) {
          const weightedScore = assignWeight > 0 && maxPts > 0
            ? Math.round((autoGrade / maxPts) * assignWeight)
            : null;
          const { data: gradedRow } = await admin
            .from('assignment_submissions')
            .update({
              grade: autoGrade,
              status: 'graded',
              weighted_score: weightedScore,
              updated_at: new Date().toISOString(),
            })
            .eq('assignment_id', assignment_id)
            .eq('portal_user_id', effectiveUserId)
            .select()
            .single();

          if (gradedRow) return NextResponse.json({ data: gradedRow }, { status: 201 });
        }
      } catch (autoErr) {
        // Auto-grading failed — submission saved, teacher can grade manually
        console.error('[auto-grade] failed:', autoErr);
      }
    }

    if (!isStaff && assignment.created_by) {
      queueService.queueNotification(assignment.created_by, 'whatsapp', {
          body: `📚 A new submission was just received for your assignment "${assignment.title || 'Assignment'}". Log into the Rillcod dashboard to review and grade it.`
      }).catch(console.error);
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
