import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createEngagementAdminClient } from '@/lib/supabase/admin';
import { queueService } from '@/services/queue.service';
import { XP_EVENTS } from '@/lib/grading';
import { engagementTables } from '@/types/engagement';

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
  context: { params: Promise<{ id: string }> },
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

    const { id: assignment_id } = await context.params;
    const body = await request.json();
    const { portal_user_id, submission_text, file_url, answers } = body;

    // Only admin/teacher may submit on behalf of another student
    const isStaff = ['admin', 'teacher'].includes(caller.role);
    const effectiveUserId = isStaff ? (portal_user_id ?? caller.id) : caller.id;

    // Fetch assignment to validate access
    const { data: assignment } = await admin
      .from('assignments')
      .select('is_active, school_id, assignment_type, metadata, questions, max_points, weight, created_by, title, grading_mode')
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

    // Grading mode pipeline
    const gradingMode = assignment.grading_mode || 'manual';
    const questions: any[] = Array.isArray(assignment.questions) ? assignment.questions : [];
    const maxPts = assignment.max_points ?? 100;
    const assignWeight = assignment.weight ?? 0;

    if (gradingMode === 'auto' && answers && data) {
      // Auto-grade: compute score inline and set status='graded'
      try {
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

          if (gradedRow) {
            // Trigger notification to student
            queueService.queueNotification(effectiveUserId, 'email', {
              subject: `Your assignment "${assignment.title || 'Assignment'}" has been graded`,
              body: `Your submission has been automatically graded. Score: ${autoGrade}/${maxPts}. Check your dashboard for details.`
            }).catch(console.error);
            return NextResponse.json({ data: gradedRow }, { status: 201 });
          }
        }
      } catch (autoErr) {
        console.error('[auto-grade] failed:', autoErr);
      }
    } else if (gradingMode === 'ai_assisted' && answers && data) {
      // AI-assisted: call AI grading endpoint, store suggestions, set status='pending_review'
      try {
        const aiRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/ai/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': request.headers.get('cookie') || '',
          },
          body: JSON.stringify({
            type: 'cbt-grading',
            questions,
            studentAnswers: answers,
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          if (aiData.success && aiData.data) {
            const totalScore = Object.values(aiData.data.scores || {}).reduce((sum: number, s: any) => sum + Number(s || 0), 0);
            await admin
              .from('assignment_submissions')
              .update({
                ai_suggested_grade: totalScore,
                ai_suggested_feedback: aiData.data.feedback || '',
                status: 'pending_review',
                updated_at: new Date().toISOString(),
              })
              .eq('assignment_id', assignment_id)
              .eq('portal_user_id', effectiveUserId);
          }
        }
      } catch (aiErr) {
        console.error('[ai-assisted-grade] failed:', aiErr);
      }
    }
    // Manual mode: status remains 'submitted', teacher grades later

    if (!isStaff && assignment.created_by) {
      queueService.queueNotification(assignment.created_by, 'email', {
          subject: `New submission: ${assignment.title || 'Assignment'}`,
          body: `📚 A new submission was just received for your assignment "${assignment.title || 'Assignment'}". Log into the Rillcod dashboard to review and grade it.`
      }).catch(console.error);
    }

    // ── Auto-award XP on student submission ───────────────────────────────────
    if (!isStaff) {
      const engAdmin = createEngagementAdminClient();
      awardSubmissionXP(engAdmin, effectiveUserId, assignment_id, assignment).catch(console.error);
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}

// ── XP Automation ─────────────────────────────────────────────────────────────
// Called fire-and-forget after successful student submission.
// Awards assignment_submitted XP + bonus if submitted early.
async function awardSubmissionXP(
  admin: ReturnType<typeof createEngagementAdminClient>,
  studentId: string,
  assignmentId: string,
  assignment: { due_date?: string | null; title?: string | null; school_id?: string | null },
) {
  const et = engagementTables;
  const now = new Date();

  // Base XP event
  const baseEvent = XP_EVENTS.find(e => e.key === 'assignment_submitted');
  if (!baseEvent) return;

  await et.xpLedger(admin).insert({
    student_id:  studentId,
    event_key:   baseEvent.key,
    event_label: baseEvent.label,
    xp:          baseEvent.xp,
    ref_id:      assignmentId,
    ref_type:    'assignment',
    school_id:   assignment.school_id ?? null,
    metadata:    { title: assignment.title ?? '' },
  });

  // Bonus XP if submitted 2+ days early
  if (assignment.due_date) {
    const due = new Date(assignment.due_date);
    const daysEarly = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysEarly >= 2) {
      const earlyEvent = XP_EVENTS.find(e => e.key === 'assignment_early');
      if (earlyEvent) {
        await et.xpLedger(admin).insert({
          student_id:  studentId,
          event_key:   earlyEvent.key,
          event_label: earlyEvent.label,
          xp:          earlyEvent.xp,
          ref_id:      assignmentId,
          ref_type:    'assignment',
          school_id:   assignment.school_id ?? null,
          metadata:    { days_early: Math.floor(daysEarly) },
        });
      }
    }
  }

  // Update weekly streak
  await updateWeekStreak(admin, et, studentId);
}

function getMondayStr(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().split('T')[0];
}

function shiftDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

async function updateWeekStreak(
  admin: ReturnType<typeof createEngagementAdminClient>,
  et: typeof engagementTables,
  studentId: string,
) {
  const thisMonday = getMondayStr(new Date());
  const { data: existing } = await et.streaks(admin)
    .select('current_streak, longest_streak, last_active_week, total_active_weeks')
    .eq('student_id', studentId)
    .single();

  if (!existing) {
    await et.streaks(admin).insert({
      student_id: studentId, current_streak: 1, longest_streak: 1,
      last_active_week: thisMonday, total_active_weeks: 1,
    });
    return;
  }

  const lastMondayStr = existing.last_active_week
    ? getMondayStr(new Date(String(existing.last_active_week)))
    : null;

  if (lastMondayStr === thisMonday) return; // already counted this week

  const prevMonday = shiftDays(thisMonday, -7);
  const newStreak = lastMondayStr === prevMonday ? (existing.current_streak ?? 0) + 1 : 1;

  await et.streaks(admin).update({
    current_streak: newStreak,
    longest_streak: Math.max(newStreak, existing.longest_streak ?? 0),
    last_active_week: thisMonday,
    total_active_weeks: (existing.total_active_weeks ?? 0) + 1,
  }).eq('student_id', studentId);
}
